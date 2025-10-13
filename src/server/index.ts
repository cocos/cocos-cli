import { serverService } from './server';

export async function startupServer() {
    serverService.init();
    try {
        await serverService.start();
    } catch (error) {
        console.error(error);
    }
}
