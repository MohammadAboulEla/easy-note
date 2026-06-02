package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// ApiConfig holds AI provider connection settings. The API key is stored locally
// only (in this file under the user's config dir) and never logged.
type ApiConfig struct {
	Provider string `json:"provider"`
	APIKey   string `json:"apiKey"`
	BaseURL  string `json:"baseURL"`
	Model    string `json:"model"`
	Stream   bool   `json:"stream"`
	// UseEnvKey resolves the API key at request time from the environment variable
	// EnvVar (or a .env file) instead of the stored APIKey.
	UseEnvKey bool   `json:"useEnvKey"`
	EnvVar    string `json:"envVar"`
}

// Appearance holds reading-comfort and theme-accent preferences.
type Appearance struct {
	Accent       string  `json:"accent"`
	PageBg       string  `json:"pageBg"`
	InkColor     string  `json:"inkColor"`
	ContentWidth int     `json:"contentWidth"`
	Font         string  `json:"font"`
	CustomFont   string  `json:"customFont"`
	FontSize     int     `json:"fontSize"`
	LineSpacing  float64 `json:"lineSpacing"`
}

// Settings is the full persisted preference set.
type Settings struct {
	Theme      string     `json:"theme"`  // light | dark | system
	Dir        string     `json:"dir"`    // ltr | rtl
	Layout     string     `json:"layout"` // classic | three-pane | focus
	Appearance Appearance `json:"appearance"`
	API        ApiConfig  `json:"api"`
}

func defaultSettings() Settings {
	return Settings{
		Theme:  "dark",
		Dir:    "ltr",
		Layout: "classic",
		Appearance: Appearance{
			Accent:       "#e0613a",
			PageBg:       "", // "" = follow theme
			InkColor:     "", // "" = follow theme
			ContentWidth: 680,
			Font:         "sans",
			CustomFont:   "",
			FontSize:     16,
			LineSpacing:  1.7,
		},
		API: ApiConfig{
			Provider:  "OpenAI-compatible",
			BaseURL:   "https://api.openai.com/v1",
			Model:     "gpt-4o-mini",
			Stream:    false,
			UseEnvKey: false,
			EnvVar:    "OPENAI_API_KEY",
		},
	}
}

func (a *App) settingsPath() string { return filepath.Join(a.dataDir, "settings.json") }

func (a *App) loadSettings() {
	a.settings = defaultSettings()
	data, err := os.ReadFile(a.settingsPath())
	if err != nil {
		a.persistSettings()
		return
	}
	// Unmarshal over defaults so newly-added fields keep sane values.
	_ = json.Unmarshal(data, &a.settings)
}

// persistSettings writes settings to disk. Callers hold a.mu.
func (a *App) persistSettings() {
	data, err := json.MarshalIndent(a.settings, "", "  ")
	if err != nil {
		return
	}
	tmp := a.settingsPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return
	}
	_ = os.Rename(tmp, a.settingsPath())
}

// GetSettings returns the persisted settings.
func (a *App) GetSettings() Settings {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.settings
}

// SaveSettings replaces and persists the settings.
func (a *App) SaveSettings(in Settings) Settings {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.settings = in
	a.persistSettings()
	return a.settings
}
