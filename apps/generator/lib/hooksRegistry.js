const path = require('path');
const xfs = require('fs.extra');
const { exists, registerTypeScript } = require('./utils');

/**
 * Registers all template hooks.
 * @param {Object} hooks Object that stores information about all available hook functions grouped by the type of the hook.
 * @param {Object} templateConfig Template configuration.
 * @param {String} templateDir Directory where template is located.
 * @param {String} hooksDir Directory where local hooks are located.
 */
async function registerHooks (hooks, templateConfig, templateDir, hooksDir) {
  await registerLocalHooks(hooks, templateDir, hooksDir);

  if (templateConfig && Object.keys(templateConfig).length > 0) await registerConfigHooks(hooks, templateDir, templateConfig);
  
  return hooks;
};

/**
 * Loads the local template hooks from default location.
 * @private
 * @param {Object} hooks Object that stores information about all available hook functions grouped by the type of the hook.
 * @param {String} templateDir Directory where template is located.
 * @param {String} hooksDir Directory where local hooks are located.
 */
async function registerLocalHooks(hooks, templateDir, hooksDir) {
  return new Promise(async (resolve, reject) => {
    const localHooks = path.resolve(templateDir, hooksDir);

    if (!await exists(localHooks)) return resolve(hooks);

    const walker = xfs.walk(localHooks, {
      followLinks: false
    });
    
    walker.on('file', async (root, stats, next) => {
      try {
        const filePath = path.resolve(templateDir, path.resolve(root, stats.name));
        
        registerTypeScript(filePath);

        delete require.cache[require.resolve(filePath)];
        const mod = require(filePath);

        addHook(hooks, mod);

        next();
      } catch (e) {
        reject(e);
      }
    });

    walker.on('errors', (root, nodeStatsArray) => {
      reject(nodeStatsArray);
    });

    walker.on('end', async () => {
      resolve(hooks);
    });
  });
}

/**
 * Loads the template hooks provided in template config.
 * @private
 * 
 * @param {Object} hooks Object that stores information about all available hook functions grouped by the type of the hook.
 * @param {String} templateDir Directory where template is located.
 * @param {String} templateConfig Template configuration.
 */
async function registerConfigHooks(hooks, templateDir, templateConfig) {
  const configHooks = templateConfig.hooks;
  const DEFAULT_MODULES_DIR = 'node_modules';

  if (typeof configHooks !== 'object' || !Object.keys(configHooks).length > 0) return;

  const promises = Object.keys(configHooks).map(async hooksModuleName => {
    let mod;
    try {
      //first we try to grab module with hooks by the module name
      //this is when generation is used on production using remote templates
      mod = require(hooksModuleName);
    } catch (error) {
      //in case template is local but was not installed in node_modules of the generator then we need to explicitly provide modules location
      mod = require(path.resolve(templateDir, DEFAULT_MODULES_DIR, hooksModuleName));
    }
    const configHooksArray = [].concat(configHooks[hooksModuleName]);

    addHook(hooks, mod, configHooksArray);
  });
  await Promise.all(promises);
  return hooks;
}

/**
 * Add hook from given module to list of available hooks
 * @private
 * @param {Object} hooks Object that stores information about all available hook functions grouped by the type of the hook.
 * @param {Object} mod Single module with object of hook functions grouped by the type of the hook
 * @param {Array} config List of hooks configured in template configuration
 */
function addHook(hooks, mod, config) {
  /**
   * ESM `export default { ... }` is transpiled to:
   * module.exports = { default: { ... } };
   * First check the `default` object, and if it exists the override mod to `default`.
   */
  if (typeof mod.default === 'object') {
    mod = mod.default;
  }

  Object.keys(mod).forEach(hookType => {
    const moduleHooksArray = [].concat(mod[hookType]);

    moduleHooksArray.forEach(hook => {
      if (config && !config.includes(hook.name)) return;

      hooks[hookType] = hooks[hookType] || [];
      hooks[hookType].push(hook);
    });
  });
  return hooks;
}

module.exports = {
  registerHooks,
  registerLocalHooks,
  registerConfigHooks,
  addHook
};