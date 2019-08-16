const ath = require('/home/wy/node/motoboat/httpclient/awyhttp');

for(var i=0; i<5000; i++) {
    ath.get('http://localhost:2021/')
    .then((data, err) => {
        console.log(data);
    });
}
