/**
 * Escape special characters in the given string of html.
 *
 * @param  {String} html
 * @return {String}
 */

var _ = require('underscore');

var Set = function(){
    this.items = [];
};

Set.prototype.add = function(item){
    if( ! _.contains(this.items, item)) {
        this.items.push(item);
    }
};

module.exports = Set;