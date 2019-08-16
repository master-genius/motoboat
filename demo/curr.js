const ath = require('../httpclient/awyhttp');

for(var i=0; i<1500; i++) {
    ath.get('http://localhost:2020/')
    .then((data, err) => {
        console.log(data);
    });
    ath.post('http://localhost:2020/pt', {
        data : {
            a : '123'
        }
    })
    .then((data, err) => {
        console.log(data);
    });
}
