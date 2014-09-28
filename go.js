var _ = require('underscore');
var http = require('http');
var mongojs = require('mongojs');
var fs = require('fs');
var Set = require('./lib/set.js');

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

var since_date = "2014-09-10";
var records_added = [];

callback = function(response) {
    var str = '';

    //another chunk of data has been received, so append it to `str`
    response.on('data', function (chunk) {
        str += chunk;
    });

    //the whole response has been received, so we just print it out here
    response.on('end', function () {
        var resp = JSON.parse(str);
        var records_to_update = resp.results.length;
        console.log("UPDATING " + records_to_update + " RECORDS");
        /**
         * collect the date added fields so we can determine the max dateAdded value seen
         * for this request
         */

        var dates_added_set = new Set();

        /**
         * @TODO add meta data from `resp` to audit table
         */
        _.each(resp.results, function(result){

            console.log("Upserting: [" + result.DateAdded + "]" + result.BusinessName);
            dates_added_set.add(result.DateAdded);

            /**
             * perform upsert so we do not duplicate entries
             */
            db.demo_test.update({Privacyid: result.Privacyid, GISAddressID: result.GISAddressID}, result, {upsert:true, safe:true}, function(err, save_result){
                records_to_update--;
                if(err) {
                    console.log(err);
                } else {
                    if(save_result.updatedExisting) {
                        console.log("Not a new record");
                    } else {
                        records_added.push({
                            id: save_result.upserted,
                            Privacyid: result.Privacyid,
                            GISAddress: result.GISAddressID
                        });
                        console.log("Is a new record");
                    }
                    console.log(save_result);
                }
                if(records_to_update == 0) {
                    var max_date_added = dates_added_set.items.sort().pop();
                    db.audit.save({
                        run_date: new Date().toISOString(),
                        since_date_utilized: since_date,
                        max_date_added_seen: max_date_added,
                        records_processed: resp.results.length,
                        records_added: records_added,
                        records_added_count: records_added.length
                    });
                    console.log("Last record Upserted, closing db connection")
                    db.close();
                }
            });
        });
    });
}

try {
    //// Get the date last checked, add one day
    //var dateSince = lastDateSince + 1 day;
    options.path = options.path + "?since=" + since_date;
    var request = http.request(options, callback).end();
} catch (e) {
    console.log(e);
}
