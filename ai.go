package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// TweakRequest is a request to rewrite a selected piece of text. Either Action
// (a preset) or Prompt (a custom instruction) drives the rewrite.
type TweakRequest struct {
	ID     string `json:"id"`     // client-generated request id (for cancellation)
	Action string `json:"action"` // improve | shorten | grammar | "" (use Prompt)
	Prompt string `json:"prompt"`
	Text   string `json:"text"`

	// Optional behavior knobs from Settings → AI. Empty/zero values fall back to
	// the built-in defaults so out-of-the-box behavior is unchanged.
	SystemPrompt     string  `json:"systemPrompt"`
	Tone             string  `json:"tone"`
	Language         string  `json:"language"`
	Verbosity        string  `json:"verbosity"`
	Temperature      float64 `json:"temperature"`
	PreserveMarkdown bool    `json:"preserveMarkdown"`
}

// --- minimal OpenAI-compatible chat types ---

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	Stream      bool          `json:"stream"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func actionInstruction(action, prompt string) string {
	switch action {
	case "improve":
		return "Improve the writing for clarity, flow, and concision while preserving the original meaning and tone."
	case "shorten":
		return "Make the text more concise without losing essential meaning."
	case "grammar":
		return "Fix only grammar, spelling, and punctuation. Do not change wording or style otherwise."
	case "formal":
		return "Rewrite the text in a more formal, professional tone."
	case "summarize":
		return "Summarize the text concisely."
	default:
		if strings.TrimSpace(prompt) != "" {
			return prompt
		}
		return "Improve the writing while preserving meaning."
	}
}

func trimURL(u string) string { return strings.TrimRight(strings.TrimSpace(u), "/") }

// envFromDotEnv reads `name` from a simple KEY=VALUE .env file at path.
func envFromDotEnv(path, name string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		k, v, ok := strings.Cut(line, "=")
		if !ok || strings.TrimSpace(k) != name {
			continue
		}
		v = strings.TrimSpace(v)
		v = strings.Trim(v, `"'`) // strip optional surrounding quotes
		return v
	}
	return ""
}

// resolveAPIKey returns the effective API key: either the stored key, or — when
// UseEnvKey is set — the value of EnvVar from the process environment, a .env in
// the app data dir, or a .env in the working directory (in that order).
func (a *App) resolveAPIKey(cfg ApiConfig) (string, error) {
	if !cfg.UseEnvKey {
		if strings.TrimSpace(cfg.APIKey) == "" {
			return "", errors.New("no API key configured — add one in Settings → API")
		}
		return cfg.APIKey, nil
	}
	name := strings.TrimSpace(cfg.EnvVar)
	if name == "" {
		name = "OPENAI_API_KEY"
	}
	if v := strings.TrimSpace(os.Getenv(name)); v != "" {
		return v, nil
	}
	if a.dataDir != "" {
		if v := envFromDotEnv(filepath.Join(a.dataDir, ".env"), name); v != "" {
			return v, nil
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		if v := envFromDotEnv(filepath.Join(cwd, ".env"), name); v != "" {
			return v, nil
		}
	}
	return "", fmt.Errorf("no key found in environment variable %s or a .env file (app data folder or working directory)", name)
}

// postChat performs a non-streaming chat completion and returns the message text.
func postChat(ctx context.Context, cfg ApiConfig, messages []chatMessage, temperature float64) (string, error) {
	if strings.TrimSpace(cfg.APIKey) == "" {
		return "", errors.New("no API key configured — add one in Settings → API")
	}
	if trimURL(cfg.BaseURL) == "" {
		return "", errors.New("no base URL configured — set one in Settings → API")
	}

	payload := chatRequest{
		Model:       cfg.Model,
		Messages:    messages,
		Temperature: temperature,
		Stream:      false,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	url := trimURL(cfg.BaseURL) + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	var parsed chatResponse
	_ = json.Unmarshal(raw, &parsed)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if parsed.Error != nil && parsed.Error.Message != "" {
			return "", fmt.Errorf("%s (HTTP %d)", parsed.Error.Message, resp.StatusCode)
		}
		return "", fmt.Errorf("request failed (HTTP %d)", resp.StatusCode)
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("the model returned no choices")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}

const defaultSystemPrompt = "You are a precise writing assistant embedded in a notes app. " +
	"Rewrite the user's text per the instruction."

// composeSystem builds the system message from the user's behavior knobs,
// falling back to the default persona when systemPrompt is empty.
func composeSystem(req TweakRequest) string {
	base := strings.TrimSpace(req.SystemPrompt)
	if base == "" {
		base = defaultSystemPrompt
	}
	var b strings.Builder
	b.WriteString(base)
	if t := strings.TrimSpace(req.Tone); t != "" && t != "neutral" {
		b.WriteString(" Use a " + t + " tone.")
	}
	if l := strings.TrimSpace(req.Language); l != "" {
		b.WriteString(" Write the result in " + l + ".")
	}
	switch req.Verbosity {
	case "concise":
		b.WriteString(" Be concise.")
	case "detailed":
		b.WriteString(" Be thorough and detailed.")
	}
	if req.PreserveMarkdown {
		b.WriteString(" Preserve the markdown structure of the text.")
	}
	b.WriteString(" Return ONLY the rewritten text — no preamble, no quotes, no explanations, no markdown code fences.")
	return b.String()
}

// TweakText rewrites the selected text using the saved API configuration.
// A per-request cancelable context is registered under reqIn.ID so CancelTweak
// can abort the in-flight HTTP call.
func (a *App) TweakText(reqIn TweakRequest) (string, error) {
	a.mu.Lock()
	cfg := a.settings.API
	a.mu.Unlock()

	if strings.TrimSpace(reqIn.Text) == "" {
		return "", errors.New("no text selected")
	}
	key, err := a.resolveAPIKey(cfg)
	if err != nil {
		return "", err
	}
	cfg.APIKey = key

	temp := reqIn.Temperature
	if temp <= 0 || temp > 1 {
		temp = 0.4 // safe default / out-of-range guard
	}

	system := composeSystem(reqIn)
	user := actionInstruction(reqIn.Action, reqIn.Prompt) + "\n\nText:\n" + reqIn.Text

	parent := a.ctx
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithTimeout(parent, 120*time.Second)
	defer cancel()

	if reqIn.ID != "" {
		a.mu.Lock()
		a.inflight[reqIn.ID] = cancel
		a.mu.Unlock()
		defer func() {
			a.mu.Lock()
			delete(a.inflight, reqIn.ID)
			a.mu.Unlock()
		}()
	}

	return postChat(ctx, cfg, []chatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}, temp)
}

// CancelTweak aborts an in-flight TweakText identified by id (no-op if unknown).
func (a *App) CancelTweak(id string) {
	a.mu.Lock()
	cancel := a.inflight[id]
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// TestConnection validates the given (possibly unsaved) config with a tiny call.
func (a *App) TestConnection(cfg ApiConfig) (string, error) {
	key, err := a.resolveAPIKey(cfg)
	if err != nil {
		return "", err
	}
	cfg.APIKey = key

	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	tctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	_, err = postChat(tctx, cfg, []chatMessage{
		{Role: "user", Content: "Reply with the single word: ok"},
	}, 0.4)
	if err != nil {
		return "", err
	}
	return "Connection successful.", nil
}
