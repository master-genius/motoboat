const motoboat = require('../main');
const fs = require('fs');
const cluster = require('cluster');

var app = new motoboat({
    debug: true,
    //showLoadInfo: false,
});

if (cluster.isMaster) {
    var fwt = fs.watch('../tmp');

    fwt.on('change', (etype, filename) => {
        console.log(etype, filename);
        if (app.rundata.workers === null) {
            return ;
        }

        for(let id in app.rundata.workers) {
            //console.log(app.rundata.workers[id]);
            app.rundata.workers[id].process.kill();
        }
    });

}

if (process.argv.indexOf('-d') > 0) {
    app.config.daemon = true;
}

app.daemon(2021, 2);

