export namespace main {
	
	export class ApiConfig {
	    provider: string;
	    apiKey: string;
	    baseURL: string;
	    model: string;
	    stream: boolean;
	    useEnvKey: boolean;
	    envVar: string;
	
	    static createFrom(source: any = {}) {
	        return new ApiConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.apiKey = source["apiKey"];
	        this.baseURL = source["baseURL"];
	        this.model = source["model"];
	        this.stream = source["stream"];
	        this.useEnvKey = source["useEnvKey"];
	        this.envVar = source["envVar"];
	    }
	}
	export class Appearance {
	    accent: string;
	    pageBg: string;
	    inkColor: string;
	    contentWidth: number;
	    font: string;
	    customFont: string;
	    fontSize: number;
	    lineSpacing: number;
	
	    static createFrom(source: any = {}) {
	        return new Appearance(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accent = source["accent"];
	        this.pageBg = source["pageBg"];
	        this.inkColor = source["inkColor"];
	        this.contentWidth = source["contentWidth"];
	        this.font = source["font"];
	        this.customFont = source["customFont"];
	        this.fontSize = source["fontSize"];
	        this.lineSpacing = source["lineSpacing"];
	    }
	}
	export class Folder {
	    id: string;
	    name: string;
	    parentId: string;
	
	    static createFrom(source: any = {}) {
	        return new Folder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.parentId = source["parentId"];
	    }
	}
	export class Note {
	    id: string;
	    title: string;
	    body: string;
	    folderId: string;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Note(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.body = source["body"];
	        this.folderId = source["folderId"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class Settings {
	    theme: string;
	    dir: string;
	    layout: string;
	    appearance: Appearance;
	    api: ApiConfig;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.dir = source["dir"];
	        this.layout = source["layout"];
	        this.appearance = this.convertValues(source["appearance"], Appearance);
	        this.api = this.convertValues(source["api"], ApiConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TweakRequest {
	    action: string;
	    prompt: string;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new TweakRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.action = source["action"];
	        this.prompt = source["prompt"];
	        this.text = source["text"];
	    }
	}
	export class Workspace {
	    folders: Folder[];
	    notes: Note[];
	
	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folders = this.convertValues(source["folders"], Folder);
	        this.notes = this.convertValues(source["notes"], Note);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

