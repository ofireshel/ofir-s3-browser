$port = 3001
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()
Write-Host "Server listening on http://localhost:$port"

$html = @"
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bouncy Cat</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html,body{height:100%;margin:0}
    body{background:#0f172a;color:#e2e8f0;font-family:Segoe UI,Arial,sans-serif;overflow:hidden}
    #stage{position:relative;width:100vw;height:100vh}
    #cat{position:absolute;left:0;top:0;will-change:transform}
    h1{position:fixed;left:16px;top:12px;margin:0;font-size:20px;color:#f8fafc;opacity:.9}
  </style>
</head>
<body>
  <h1>kuku 456</h1>
  <div id="stage">
    <div id="cat">
      <svg width="160" height="160" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-label="cat">
        <circle cx="64" cy="68" r="40" fill="#f4d2b7" stroke="#1f2937" stroke-width="3"/>
        <polygon points="38,28 58,44 28,48" fill="#f4d2b7" stroke="#1f2937" stroke-width="3"/>
        <polygon points="90,28 70,44 100,48" fill="#f4d2b7" stroke="#1f2937" stroke-width="3"/>
        <circle cx="52" cy="64" r="5" fill="#0f172a"/>
        <circle cx="76" cy="64" r="5" fill="#0f172a"/>
        <polygon points="64,72 58,78 70,78" fill="#ef4444"/>
        <line x1="74" y1="76" x2="110" y2="76" stroke="#1f2937" stroke-width="2"/>
        <line x1="74" y1="81" x2="110" y2="86" stroke="#1f2937" stroke-width="2"/>
        <line x1="74" y1="71" x2="110" y2="66" stroke="#1f2937" stroke-width="2"/>
        <line x1="54" y1="76" x2="18" y2="76" stroke="#1f2937" stroke-width="2"/>
        <line x1="54" y1="81" x2="18" y2="86" stroke="#1f2937" stroke-width="2"/>
        <line x1="54" y1="71" x2="18" y2="66" stroke="#1f2937" stroke-width="2"/>
      </svg>
    </div>
  </div>
  <script>
    (function(){
      var cat=document.getElementById('cat');
      var x=40,y=40,vx=3,vy=2;
      function step(){
        var w=window.innerWidth,h=window.innerHeight;
        var rect=cat.getBoundingClientRect();
        var cw=rect.width,ch=rect.height;
        x+=vx; y+=vy;
        if(x<0){x=0;vx=-vx}
        if(y<0){y=0;vy=-vy}
        if(x+cw>w){x=w-cw;vx=-vx}
        if(y+ch>h){y=h-ch;vy=-vy}
        cat.style.transform='translate('+x+'px,'+y+'px)';
        window.requestAnimationFrame(step);
      }
      window.requestAnimationFrame(step);
    })();
  </script>
</body>
</html>
"@

$body = [System.Text.Encoding]::UTF8.GetBytes($html)
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $buffer = New-Object byte[] 1024
    [void]$stream.Read($buffer, 0, $buffer.Length)
    $headers = "HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    try { $stream.Write($headerBytes, 0, $headerBytes.Length); $stream.Write($body, 0, $body.Length); $stream.Flush() } catch {}
  } finally { if ($client) { $client.Close() } }
}
