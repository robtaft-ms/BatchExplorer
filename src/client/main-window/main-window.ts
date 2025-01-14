import { AUTO_UPDATE_MAIN_SERVICE_TOKEN } from "@batch-flask/electron";
import { log } from "@batch-flask/utils";
import { TelemetryManager } from "client/core/telemetry";
import { BrowserWindow, app, ipcMain, nativeImage } from "electron";
import { BehaviorSubject, Observable } from "rxjs";
import { Constants } from "../client-constants";
import { BatchExplorerApplication, GenericWindow } from "../core";

// Webpack dev server url when using HOT=1
const devServerUrl = Constants.urls.main.dev;

// Webpack build output
const buildFileUrl = Constants.urls.main.prod;

export enum WindowState {
    Closed,
    Loading,
    /**
     * When the javascript is done loading and the app is initializing
     */
    Initializing,
    Ready,
    /**
     * Happens when the application fail to load because the dev server is not started or files might be corrupted
     */
    FailedLoad,
}

export class MainWindow extends GenericWindow {
    public appReady: Promise<void>;
    public state: Observable<WindowState>;

    public get webContents() {
        return this._window.webContents;
    }

    private _state = new BehaviorSubject<WindowState>(WindowState.Closed);
    private _resolveAppReady: (value?: any) => void;

    constructor(batchExplorerApp: BatchExplorerApplication, private telemetryManager: TelemetryManager) {
        super(batchExplorerApp);
        this.state = this._state.asObservable();
        this.appReady = new Promise((resolve) => {
            this._resolveAppReady = resolve;
        }).then(() => this._state.next(WindowState.Ready));
    }

    public debugCrash() {
        this.show();
    }

    public async send(key: string, message: string) {
        if (this._window) {
            await this.appReady;
            this._window.webContents.send(key, message);
        }
    }

    public once(event: any, callback: (...args) => void) {
        return this._window.once(event, callback);
    }

    protected createWindow() {
        this._state.next(WindowState.Loading);
        const window = new BrowserWindow({
            title: app.name,
            height: 1000,
            icon: nativeImage.createFromDataURL(Constants.urls.icon),
            width: 1600,
            minWidth: 1200,
            minHeight: 300,
            show: false, // Don't show the window until it is ready
            titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
            webPreferences: {
                webSecurity: false,
                allowRunningInsecureContent: false,
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true,
            },
        });

        const url = process.env.HOT ? devServerUrl : buildFileUrl;
        this._setupEvents(window);
        window.loadURL(url);

        const anyWindow = window as any;
        anyWindow.windowHandler = this;
        anyWindow.batchExplorerApp = this.batchExplorerApp;
        anyWindow._sharedServices = {
            [AUTO_UPDATE_MAIN_SERVICE_TOKEN]: this.batchExplorerApp.autoUpdater,
        };
        anyWindow._injector = this.batchExplorerApp.injector;
        anyWindow.authenticationWindow = this.batchExplorerApp.authenticationWindow;
        anyWindow.translationsLoader = this.batchExplorerApp.translationLoader;
        anyWindow.localeService = this.batchExplorerApp.localeService;
        anyWindow.TELEMETRY_ENABLED = this.telemetryManager.telemetryEnabled;
        anyWindow.clientConstants = Constants;

        // Open the DevTools.
        if (process.env.NODE_ENV !== "production") {
            window.webContents.openDevTools({ mode: 'undocked' });
        }

        return window;
    }

    private _setupEvents(window: Electron.BrowserWindow) {
        window.webContents.on("crashed", (event: Electron.Event, killed: boolean) => {
            log.error("There was a crash", { event, killed });
            this.batchExplorerApp.recoverWindow.createWithError("The window has crashed: killed=" + event.returnValue);
        });

        ipcMain.once("app-ready", (event) => {
            if (this._window && event.sender.id === this._window.webContents.id) {
                this._resolveAppReady();
            }
        });

        ipcMain.once("initializing", (event) => {
            if (this._window && event.sender.id === this._window.webContents.id) {
                this._state.next(WindowState.Initializing);
            }
        });

        window.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
            this._state.next(WindowState.FailedLoad);
            log.error(`Failed to load main window: ${errorDescription} (Error code ${errorCode})`);
        });

        // eslint-disable-next-line @typescript-eslint/ban-types
        window.on("unresponsive", (error: Error) => {
            log.error("There was a crash", error);
            this.batchExplorerApp.recoverWindow.createWithError(error.message);
        });
    }
}
