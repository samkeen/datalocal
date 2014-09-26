var _ = require('underscore');
var http = require('http');
var mongojs = require('mongojs');
var fs = require('fs');

var app_path = __dirname;
var config_path = app_path + "/config/config.json";
var db_config = JSON.parse(fs.readFileSync(config_path, 'utf8'));
var db_uri_template = _.template("mongodb://<%= username %>:<%= password %>@<%= host %>:<%= port %>/<%= db_name %>");
var db_uri = db_uri_template({
    username: db_config.db_username,
    password: db_config.db_password,
    host: db_config.db_host,
    port: db_config.db_port,
    db_name: db_config.db_name
});

var db = mongojs(db_uri, ['demo_test', 'audit'])

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

        /**
         * @TODO add meta data from `resp` to audit table
         */
        _.each(resp.results, function(result){
            console.log("Saving: [" + result.DateAdded + "]" + result.BusinessName);

            /**
             * perform upsert so we do not duplicate entries
             * @TODO on insert, $id is returned, record this in audit log
             */
            db.demo_test.update({Privacyid: result.Privacyid}, result, {upsert:true}, function(err, save_result){
                if(err) {
                    console.log(err);
                } else {
                    console.log(save_result);
                }

            });


        });
        /**
         * @TODO Add Privacyid for all and $_id's for those created
         */
        db.audit.save({date: new Date().toISOString(), records_processed: resp.results.length});

    });
}

try {
    //// Get the date last checked, add one day
    //var dateSince = lastDateSince + 1 day;
    options.path = options.path + "?since=2014-09-01";

    http.request(options, callback).end();
} catch (e) {
    console.log(e);
}
