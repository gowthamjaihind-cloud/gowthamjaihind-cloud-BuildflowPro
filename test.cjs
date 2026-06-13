const http = require('http');
http.get('http://localhost:3000', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, '\nBODY:', data.substring(0, 500)));
}).on('error', (e) => {
  console.error("Got error: " + e.message);
});
