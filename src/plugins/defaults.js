import Server from './server';
import Rest from './rest';
import WebSockets from './ws';
import StoreQueue from './storeQueue';

/**
 * Export default plugins
 */
const defaultPlugins = [];
defaultPlugins.push(Server);
defaultPlugins.push(Rest); // NOTE: must be initialized after Server
defaultPlugins.push(WebSockets); // NOTE: must be initialized after Server
defaultPlugins.push(StoreQueue);

export default defaultPlugins;
