(function(){
  // Extract tool ID from current path: /tool-name/ -> tool-name, /tool-name -> tool-name
  var path = location.pathname.replace(/\/+$/, '').split('/').pop() || 'home';
  var key = 'counted_' + path;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  try {
    fetch('/api/message-board/counter/' + path, { method: 'POST', keepalive: true });
  } catch(e) {}
})();
