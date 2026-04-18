/* Anti-inspect / Source protection */
(function(){
  // Disable right-click
  document.addEventListener('contextmenu',function(e){e.preventDefault();return false;});
  
  // Disable keyboard shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+S)
  document.addEventListener('keydown',function(e){
    if(e.key==='F12') {e.preventDefault();return false;}
    if(e.ctrlKey && e.shiftKey && (e.key==='I'||e.key==='i'||e.key==='J'||e.key==='j'||e.key==='C'||e.key==='c')){e.preventDefault();return false;}
    if(e.ctrlKey && (e.key==='U'||e.key==='u'||e.key==='S'||e.key==='s')){e.preventDefault();return false;}
  });

  // Disable text selection on body
  document.addEventListener('selectstart',function(e){
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return true;
    e.preventDefault();return false;
  });

  // Disable drag
  document.addEventListener('dragstart',function(e){e.preventDefault();return false;});

  // Debugger trap - slows down dev tools
  var _0x=['\x64\x65\x62\x75\x67\x67\x65\x72'];
  (function _dt(){
    try{(function(){return false;})['constructor'](_0x[0])['call']();}catch(e){}
    setTimeout(_dt,500);
  })();

  // Detect dev tools open (resize-based)
  var _th=160;
  setInterval(function(){
    if(window.outerWidth-window.innerWidth>_th||window.outerHeight-window.innerHeight>_th){
      document.body.innerHTML='';
    }
  },2000);

  // Console log override
  var _c=console;
  Object.defineProperty(window,'console',{
    get:function(){
      return{log:function(){},warn:function(){},error:function(){},info:function(){},debug:function(){},dir:function(){},table:function(){}};
    },
    set:function(){}
  });
})();
