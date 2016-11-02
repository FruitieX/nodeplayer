import Server from './server';
import Rest from './rest';

const Plugins = [];
Plugins.push(Server);
Plugins.push(Rest); // NOTE: must be initialized after Server

module.exports = Plugins;
