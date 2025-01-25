importScripts('settings_manager.js');

var settingsManager = new SettingsManager();

Array.prototype.unique = function () {
  let a = [];
  let l = this.length;
  for (let i = 0; i < l; i++) {
    for (let j = i + 1; j < l; j++) {
      if (this[i].url === this[j].url) j = ++i;
    }
    a.push(this[i]);
  }
  return a;
};

function openTab(urls, delay, windowId, openerTabId, tabPosition, closeTime) {
  const obj = {
    windowId,
    url: urls.shift().url,
    active: false,
  };

  // only add tab ID if delay feature is not being used as if tab with openerTabId is closed, the links stop opening
  if (!delay) {
    obj.openerTabId = openerTabId;
  }

  if (tabPosition != null) {
    obj.index = tabPosition;
    tabPosition++;
  }

  chrome.tabs.create(obj, function (tab) {
    if (closeTime > 0) {
      setTimeout(function () {
        chrome.tabs.remove(tab.id);
      }, closeTime * 1000);
    }
  });

  if (urls.length > 0) {
    setTimeout(function () {
      openTab(urls, delay, windowId, openerTabId, tabPosition, closeTime);
    }, delay * 1000);
  }
}

let offscreenPromise;
function createOffscreenDocument() {
  if (offscreenPromise) return offscreenPromise;

  return chrome.runtime.getContexts({contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]}).then(contexts => {
    if (contexts.length) return true;

    offscreenPromise ||= chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('copy_to_clipboard.html'),
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Required to copy to clipboard',
    });

    return offscreenPromise;
  });
}

function copyToClipboard(text) {
  createOffscreenDocument().then(() => {
    chrome.runtime.sendMessage({
      message: 'copy-to-clipboard',
      text: text,
    });
  });
}

function pad(number, length) {
  let str = '' + number;
  while (str.length < length) {
    str = '0' + str;
  }

  return str;
}

function timeConverter(a) {
  let year = a.getFullYear();
  let month = pad(a.getMonth() + 1, 2);
  let day = pad(a.getDate(), 2);
  let hour = pad(a.getHours(), 2);
  let min = pad(a.getMinutes(), 2);
  let sec = pad(a.getSeconds(), 2);
  let time = year + '-' + month + '-' + day + ' ' + hour + ':' + min + ':' + sec;
  return time;
}

// Link copy formats
const URLS_WITH_TITLES = 0;
const URLS_ONLY = 1;
const URLS_ONLY_SPACE_SEPARATED = 2;
const TITLES_ONLY = 3;
const AS_LINK_HTML = 4;
const AS_LIST_LINK_HTML = 5;
const AS_MARKDOWN = 6;

function formatLink({url, title}, copyFormat) {
  switch (parseInt(copyFormat)) {
  case URLS_WITH_TITLES:
    return title + '\t' + url + '\n';
  case URLS_ONLY:
    return url + '\n';
  case URLS_ONLY_SPACE_SEPARATED:
    return url + ' ';
  case TITLES_ONLY:
    return title + '\n';
  case AS_LINK_HTML:
    return '<a href="' + url + '">' + title + '</a>\n';
  case AS_LIST_LINK_HTML:
    return '<li><a href="' + url + '">' + title + '</a></li>\n';
  case AS_MARKDOWN:
    return '[' + title + '](' + url + ')\n';
  }
}

function handleRequests(request, sender, callback) {
  switch (request.message) {
  case 'activate':
    if (request.setting.options.block) {
      request.urls = request.urls.unique();
    }

    if (request.urls.length === 0) {
      return;
    }

    if (request.setting.options.reverse) {
      request.urls.reverse();
    }

    switch (request.setting.action) {
    case 'copy':
      var text = '';
      for (let i = 0; i < request.urls.length; i++) {
        text += formatLink(request.urls[i], request.setting.options.copy);
      }

      if (request.setting.options.copy == AS_LIST_LINK_HTML) {
        text = '<ul>\n' + text + '</ul>\n';
      }

      copyToClipboard(text);
      break;
    case 'bm':
      chrome.bookmarks.getTree(function (bookmarkTreeNodes) {
        // make assumption that bookmarkTreeNodes[0].children[0] refers to the "bookmarks bar" folder
        // as different languages will not use the english name to refer to the folder
        chrome.bookmarks.create(
          {parentId: bookmarkTreeNodes[0].children[0].id, title: 'Linkclump ' + timeConverter(new Date())},
          function (newFolder) {
            for (let j = 0; j < request.urls.length; j++) {
              chrome.bookmarks.create({
                parentId: newFolder.id,
                title: request.urls[j].title,
                url: request.urls[j].url,
              });
            }
          },
        );
      });

      break;
    case 'win':
      chrome.windows.getCurrent(function (currentWindow) {
        chrome.windows.create(
          {url: request.urls.shift().url, focused: !request.setting.options.unfocus},
          function (window) {
            if (request.urls.length > 0) {
              openTab(request.urls, request.setting.options.delay, window.id, undefined, null, 0);
            }
          },
        );

        if (request.setting.options.unfocus) {
          chrome.windows.update(currentWindow.id, {focused: true});
        }
      });
      break;
    case 'tabs':
      chrome.tabs.get(sender.tab.id, function (tab) {
        chrome.windows.getCurrent(function (window) {
          let tab_index = null;

          if (!request.setting.options.end) {
            tab_index = tab.index + 1;
          }

          openTab(
            request.urls,
            request.setting.options.delay,
            window.id,
            tab.id,
            tab_index,
            request.setting.options.close,
          );
        });
      });
      break;
    }

    break;
  case 'init':
    settingsManager.load().then(callback);
    return true; // true is important for callback to work from a promise
  case 'update':
    settingsManager.save(request.settings);

    chrome.windows.getAll(
      {
        populate: true,
      },
      function (windowList) {
        windowList.forEach(function (window) {
          window.tabs.forEach(function (tab) {
            chrome.tabs.sendMessage(
              tab.id,
              {
                message: 'update',
                settings: request.settings,
              },
              null,
            );
          });
        });
      },
    );

    break;
  }
}

// needed only to detect reloading/update of extension
chrome.runtime.onConnect.addListener(() => {});

chrome.runtime.onMessage.addListener(handleRequests);

settingsManager.initOrUpdate().then(firstRun => {
  // inject Linkclump into windows currently open to make it just work
  chrome.windows.getAll({populate: true}, windows => {
    windows.forEach(window => {
      window.tabs.forEach(tab => {
        if (!/^https?:\/\//.test(tab.url)) return;
        if (tab.discarded) return;

        chrome.scripting.executeScript({
          target: {tabId: tab.id},
          files: ['linkclump.js'],
        });
      });
    });
  });

  if (firstRun) {
    // show tour and options page
    chrome.tabs.create({
      url: chrome.runtime.getURL('pages/options.html') + '?init=true',
    });
  }
});
