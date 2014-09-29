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

var records_added = [];
var run_date = new Date().toISOString();
var from_date_param;
var to_date_param;

callback = function(response) {
    var str = '';

    //another chunk of data has been received, so append it to `str`
    response.on('data', function (chunk) {
        str += chunk;
    });

    //the whole response has been received, so we just print it out here
    response.on('end', function () {
        var resp = JSON.parse(str);
        if( ! resp.results) {
            console.log("No records returned");
            db.audit.save({
                run_date: run_date,
                to_date_utilized: to_date_param,
                from_date_utilized: from_date_param,
                max_date_added_seen: null,
                records_processed: 0,
                records_added: null,
                records_added_count: 0
            });
            db.close();
        } else {
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
            _.each(resp.results, function (result) {

                console.log("Upserting: [" + result.DateAdded + "]" + result.BusinessName);
                dates_added_set.add(result.DateAdded);

                /**
                 * perform upsert so we do not duplicate entries
                 */
                db.demo_test.update({
                    Privacyid: result.Privacyid,
                    GISAddressID: result.GISAddressID
                }, result, {upsert: true, safe: true}, function (err, save_result) {
                    records_to_update--;
                    if (err) {
                        console.log(err);
                    } else {
                        if (save_result.updatedExisting) {
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
                    if (records_to_update == 0) {
                        var max_date_added = dates_added_set.items.sort().pop();
                        db.audit.save({
                            run_date: run_date,
                            from_date_utilized: from_date_param,
                            to_date_utilized: to_date_param,
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
        }
    });
}

/**
 *
 * @param Date date
 * @returns {string}
 */
function formatDate(date) {
    return date.getFullYear()
        + "-"
        + ('0' + (parseInt(date.getMonth(), 10) + 1)).slice(-2)
        + "-"
        + ('0' + date.getDate()).slice(-2);
}

/**
 *
 * @param int days
 * @returns {Date}
 */
function daysAgo(days) {
    var now = new Date();
    now.setDate(now.getDate() - days);
    return now;
}

/**
 *
 * @returns {{}}
 */
function commandlineArgs() {
    var args = process.argv.slice(2);
    var arg_key_vals = {};
    _.each(args, function (arg) {
        var elements = arg.split('=');
        arg_key_vals[elements[0]] = elements[1];
    });
    return arg_key_vals;
}

try {
    var cmd_args = commandlineArgs();
    if(cmd_args.from && cmd_args.to) {
        from_date_param = cmd_args.from;
        to_date_param = cmd_args.to;
        console.log("Using commandline overrides for from[" + from_date_param
            + "] and to[" + to_date_param + "] dates");
        options.path = options.path + "?from=" + from_date_param + "&to=" + to_date_param;
        http.request(options, callback).end();
    } else {
        db.audit.find().sort({max_date_added_seen: -1}).limit(1, function(err, result){
            var result = result.pop();
            from_date_param = formatDate(daysAgo(60));
            var tomorrow =  new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            to_date_param = formatDate(tomorrow);
            console.log("using to date param: " + to_date_param);
            if(result && result.max_date_added_seen) {
                console.log("Found max_date_added_seen of: '" + result.max_date_added_seen
                + "' From get records run on: '" + result.run_date + "'");
                from_date_param = formatDate(new Date(result.max_date_added_seen));
            } else {
                console.log("Found no previous get records entry in audit collection, using from date: " + from_date_param);
            }
            options.path = options.path + "?from=" + from_date_param + "&to=" + to_date_param;
            http.request(options, callback).end();
        });
    }


} catch (e) {
    console.log(e);
}


