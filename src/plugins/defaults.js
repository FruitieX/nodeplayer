import Server from './server';
import Rest from './rest';

/**
 * Export default plugins
 */
const defaultPlugins = [];
defaultPlugins.push(Server);
defaultPlugins.push(Rest); // NOTE: must be initialized after Server

export default defaultPlugins;
