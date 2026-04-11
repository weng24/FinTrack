import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.fintrack.app',
    appName: 'FinTrack',
    webDir: 'dist',
    plugins: {
        GoogleAuth: {
            scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.appdata'],
            serverClientId: '47892888369-q2mss1djd8s2rldol2l4v5n5o2nd7iuf.apps.googleusercontent.com', 
            forceCodeForRefreshToken: true,
        },
    },
    android: {
        buildOptions: {
            keystorePath: undefined,
            keystoreAlias: undefined,
        }
    }
};

export default config;
