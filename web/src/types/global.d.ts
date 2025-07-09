
declare global {
    interface Window {
        showDesktopProperties: () => void;
        openTerminalHere: () => void;
        createNewFile: () => void;
        createNewFolder: () => void;
        refreshDesktop: () => void;
        showAbout: () => void;
        desktop: any; // Or a more specific type if available
        swissknife: any; // Or a more specific type if available
        unifiedSwissKnife: any; // Or a more specific type if available
        stliteManager: any; // Or a more specific type if available
        debugUnified: any; // Or a more specific type if available
        GrandmaStrudelDAW: any; // If it's globally available
        strudelDAW: any; // If it's globally available
    }
}

export {}; // This ensures the file is treated as a module
