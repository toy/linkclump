const CURRENT_VERSION = '5';

function SettingsManager() {}

const storage = chrome.storage.local;

SettingsManager.prototype.init = function () {
  const settings = {
    actions: {
      101: {
        mouse: 0, // left mouse button
        key: 16, // shift key
        action: 'tabs',
        color: '#FFA500',
        options: {
          smart: 1,
          ignore: [0],
          delay: 0,
          close: 0,
          block: true,
          reverse: false,
          end: false,
        },
      },
      102: {
        mouse: 2, // right mouse button
        key: 16, // shift key
        action: 'copy',
        color: '#1E90FF',
        options: {
          smart: 1,
          ignore: [0],
          copy: 0,
          block: false,
          reverse: false,
        },
      },
    },
    blocked: [],
  };

  return storage.set({settings: settings, version: CURRENT_VERSION}).then(() => settings);
};

SettingsManager.prototype.load = function () {
  return storage
    .get('settings')
    .then(({settings}) => settings)
    .catch(error => {
      console.log(`Unable to properly load linkclump (${error}), returning to default settings`);
      return this.init();
    });
};

SettingsManager.prototype.save = settings => storage.set({settings: settings});

SettingsManager.prototype.initOrUpdate = function () {
  return storage.get('version').then(({version}) => {
    if (version === undefined) {
      return this.init().then(() => true);
    } else if (version !== CURRENT_VERSION) {
      return this.init().then(() => false);
    }
  });
};
