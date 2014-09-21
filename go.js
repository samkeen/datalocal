var _ = require('underscore');
var http = require('http');
var mongojs = require('mongojs');
var fs = require('fs');

var app_path = __dirname;
var config_path = app_path + "/config.json";
var db_config = JSON.parse(fs.readFileSync(config_path, 'utf8'));
var db_uri_template = _.template("mongodb://<%= username %>:<%= password %>@<%= host %>:<%= port %>/<%= db_name %>");
var db_uri = db_uri_template({
    username: db_config.db_username,
    password: db_config.db_password,
    host: db_config.db_host,
    port: db_config.db_port,
    db_name: db_config.db_name
});

var db = mongojs.connect(db_uri, ['demo_test'])

var options = {
    host: 'api.civicapps.org',
    path: '/business-licenses/'
};

callback = function(response) {
    var str = '';

    //another chunk of data has been received, so append it to `str`
    response.on('data', function (chunk) {
        str += chunk;
    });

    //the whole response has been received, so we just print it out here
    response.on('end', function () {
        var resp = JSON.parse(str);
        db.demo_test.save(resp, function(err, result){
            if(err) {
                console.log(err);
            } else {
                console.log(result);
            }

        });

    });
}

try {
    http.request(options, callback).end();
} catch (e) {
    console.log(e);
}
