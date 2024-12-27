chrome.runtime.onMessage.addListener((request) => {
  if (request.message !== 'copy-to-clipboard') return

  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.value = request.text;
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
});
