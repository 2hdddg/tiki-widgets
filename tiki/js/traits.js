define([
    'jquery',
    'underscore',
    'backbone',
    'globalize/globalize',
    './util'
], function($, _, Backbone, Globalize, Util) {
    'use strict';

    
    var Traits = {};


    // =========
    // = Utils =
    // =========
    var parsedatetime = function(v) {
        if(v === null)
            return null;
        if(!_.isString(v) && !_.isDate(v))
            throw new TypeError();        
        var timestamp = Util.interpretdate(v);
        if(!timestamp)
            throw new ValueError('Invalid date format');
        return timestamp;
    };


    
    function ErrorBase(message) {
        this.message = message;
    }
    ErrorBase.prototype.toString = function(config) { 
        return this.name + ': ' + this.message;
    };
    ErrorBase.extend = Util.extend;
    
    var ValueError = ErrorBase.extend('ValueError', {name: 'ValueError'});
    

    Traits.Model = Backbone.Model.extend({
        /*
        Extension of Backbone.Model adding support for typed attributes and 
        serialization.
        
        >>> var Thing = Traits.Model.extend({
        >>>     traits: {
        >>>         'start_at': new traits.DateTime()
        >>>     }
        >>> })
        >>> thing = new Thing();
        >>> thing.set('start_at', '2001-01-01')
        >>> thing.get('start_at')
        Thu Feb 01 2001 00:00:00 GMT+0100 (CET)
        
        "traits" can also be a function returning a dict of traits.

        >>> var Thing = Traits.Model.extend({
        >>>     traits: function() {
        >>>         return {'start_at': new traits.DateTime()};
        >>>     }
        >>> })
        
        It also adds support for declaring setter functions using a special 
        syntax: "set_mypropertyname".

        >>> var Thing = Traits.Model.extend({
        >>>     set_score: function(value, attrs, options, key) {
        >>>         attrs[key] = score * 2;
        >>>     }
        >>> })
        >>> thing = new Thing({score: 5});
        >>> thing.get('score')
        10        
        */
        initcls: function() {
            var proto = this.prototype, 
                constr = this;
            if(_.isFunction(proto.traits))
                proto.traits = proto.traits.call(proto);
            _.each(proto.traits, function(trait, name) {
                trait.name = name;
                Object.defineProperty(proto, name, {
                    get: function() { return this.get(name); },
                    set: function(value) {
                        var data = {};
                        data[name] = value;
                        this.set(data);
                    },
                    configurable: true,
                    enumerable: true
                });
            });
                        
            _.each(Util.arrayify(proto.merge), function(propname) {
                var parentval = constr.__super__[propname] || {};
                proto[propname] = _.extend({}, parentval, _.result(proto, propname));
            });
        },
        get: function(attr) {
            if(this['get_'+attr])
                return this['get_'+attr]();
            return this.attributes[attr];
        },        
        set: function(key, value, options) {
            var attrs, attr, val, errors={},
                options = _.extend(options || {}, {validate: true});
                
            if(_.isObject(key) || key === null) {
                attrs = key;
                options = value;
            } else {
                attrs = {};
                attrs[key] = value;
            }
            
            var attrslist = _(attrs).map(function(v,k) {return [k,v]})
            if(this.setorder) {
                var setorder = this.setorder;
                attrslist = _.sortBy(attrslist, function(tup) {
                    return _.indexOf(tup[0], setorder)
                });
            }
            
            
            _.each(attrslist, function(tup) {
                var key = tup[0], value = tup[1];
                if(typeof this['set_' + key] === 'function') {
                    this['set_' + key](value, attrs, options, key, errors);
                }
                else if(this.traits && this.traits[key]) {
                    if(this.catchErrors)
                        try {
                            attrs[key] = this.traits[key].parse(value, this, attrs, key);
                        }
                        catch(e) {
                            if(e.name == 'TypeError' || e.name == 'ValueError') {
                                errors[key] = e;
                                console.warn(e);
                            }
                            else throw e;
                        }
                    else
                        attrs[key] = this.traits[key].parse(value, this, attrs, key);
                }
            }, this);
            
            if(_.isEmpty(errors)) {
                this.validationError = null;
                return Backbone.Model.prototype.set.call(this, attrs, options);
            }
            this.validationError = errors;
            options.validationError = errors;
            this.trigger('invalid', this, errors, options);
        },
        toJSON: function() {
            var traits = this.traits, attrs = this.attributes;
            if(_.isEmpty(traits)) 
                return _.clone(attrs)
            return _.object(_.map(this.attributes, function(v, k) {
                return [k, traits[k] ? traits[k].toJSON(attrs[k]) : attrs[k]]
            }));            
        },
    });
    Traits.Model.extend = Util.extend;




    var Trait = function() {
        if(this.initialize)
            this.initialize.apply(this, arguments);
    };
    _.extend(Trait.prototype, Backbone.Events, {
        initialize: function() {},
        toString: function() {
            return 'Traits.'+this.constructor.name+'(name='+Util.repr(this.name)+')';
        }
    });
    Trait.extend = Util.extend;
        

    
    Traits.String = Trait.extend('Traits.String', {
        constructor: function(config) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.String(config);
        },
        parse: function(v) {
            if(v != null)
                return String(v);
            return null;
        },
        toJSON: function(v) {
            return v;
        }
    });


    Traits.Bool = Trait.extend('Traits.Bool', {
        constructor: function(config) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.Bool(config);
        },        
        parse: function(v) {
            return !!v;
        },
        toJSON: function(v) {
            return v;
        }
    });
    
    
    Traits.Float = Trait.extend('Traits.Float', {
        constructor: function(config) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.Float(config);
        },        
        parse: function(v) {
            if(v == null || v === '') 
                return null;
            if(_.isString(v))
                v = Globalize.parseFloat(v); // returns NaN on fail.
            else
                v = parseFloat(v)  
            if(_.isNaN(v)) 
                throw new TypeError();
            return v;
        },
        toJSON: function(v) {
            return v;
        }
    });    
    Traits.Number = Traits.Float; // Legacy


    Traits.Int = Trait.extend('Traits.Int', {
        constructor: function(config) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.Int(config);
        },        
        parse: function(v) {
            if(v == null || v === '') 
                return null;
            if(_.isString(v))
                v = Globalize.parseInt(v); // returns NaN on fail.
            else
                v = parseInt(v);
            if(_.isNaN(v)) 
                throw new TypeError();
            return v;
        },
        toJSON: function(v) {
            return v;
        }
    });    
    

    
    Traits.Date = Trait.extend('Traits.Date', {
        constructor: function(config) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.Date(config);
        },
        parse: function(v) {
            if(v === null)
                return null;
            var v = parsedatetime(v);
            // strip time
            return new Date(v.getFullYear(), v.getMonth(), v.getDate());
        },
        toJSON: function(v) {
            /* Return eg 2012-03-22 */
            return Util.dateToYMD(v);
        }
    });


    Traits.DateTime = Trait.extend('Traits.DateTime', {
        /* Timezone-aware timestamp.
        self.toJSON(value) returns the value as UTC time, 
        eg "2014-02-11T15:10:42.021Z"
        */
        constructor: function(config) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.DateTime(config);
        },        
        parse: function(v) {
            if(v === null)
                return null;
            return parsedatetime(v);
        },
        toJSON: function(v) {
            // UTC datetime string, eg "2014-02-11T15:10:42.021Z"
            return v.toISOString();
        }
    });
    
    Traits.Instance = Trait.extend('Traits.Instance', {
        constructor: function(config) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.Instance(config);
        },
        initialize: function(type) {
            this.type = type;
        },
        parse: function(v) {
            var type = this.type;
            if(_.isFunction(type) && !type.extend) { // ducktyping Model
                type = type();
            }
            if(v instanceof type)
                return v;
            return new type(v, {parse: true});
        },
        toJSON: function(v) {
            if(v)
                return v.toJSON();
        }
    });
    
    
    Traits.Collection = Trait.extend('Traits.Collection', {

        constructor: function(config, options) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.Collection(config, options);
        },
        initialize: function(config, options) {
            config = config || {};
            this.Collection = Backbone.Collection;
            this.options = options;

            if(config && config.prototype && config.prototype.add) { // ducktype collection
                this.Collection = config;
            }
        },
        parse: function(v, obj, attrs, key) {            
            // Convert eg 'foo' => [{id: 'foo'}]
            var Collection = this.Collection;
            if(_.isFunction(this.Collection) && !this.Collection.extend) {
                Collection = this.Collection();
            }
            if(!v || v instanceof Collection) {
                return v;
            }
                
            if(v instanceof Backbone.Collection) {
                v = v.models;
                if(Collection)
                    v = _.map(v, function(o) { return o.attributes; })
            }
            else if(v)
                v = _.map(Util.arrayify(v), function(o) {
                    if(_.isString(o))
                        return {id: o};
                    else if(o.attributes)
                        return o.attributes
                    return o;
                }, this);
            

                
            if(v) {
                return new Collection(v, this.options);
            }
        },
        toJSON: function(v, obj) {
            // 'v' is a Collection
            return _.map(v.each(function(item) {
                return item.toJSON();
            }));
        }
    });
    
    Traits.Subset = Trait.extend('Traits.Subset', {
        constructor: function(config) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.Subset(config);
        },        
        initialize: function(config) {
            // 'source' is the name of a collection trait within this model
            //  or any Collection object.
            this.source = _.isString(config) ? config : config.source;
        },
        parse: function(v, obj, attrs, key) {
            if(v instanceof Util.Subset)
                return v;

            if(v)
                v = _.map(Util.arrayify(v), function(o) {
                    if(_.isString(o))
                        return {id: o};
                    return o;
                }); 
            
            
            var s = this.source;
            if(_.isString(s)) {         
                s = obj.get(s);
                if(!s) 
                    s = attrs[this.source];
            }                
            return new Util.Subset(v || [], {source: s});            
        },
        toJSON: function(v, obj) {
            // 'v' is a Collection
            return _.map(v.each(function(item) {
                return item.toJSON();
            }));
        }
    });


    Traits.CollectionModel = Trait.extend('Traits.CollectionModel', {
        constructor: function(config) {
            if (this instanceof Trait) this.initialize.apply(this, arguments); else return new Traits.CollectionModel(config);
        },
        initialize: function(config) {
            // 'source' is the name of a collection trait within this model
            //  or any Collection object.
            this.source = _.isString(config) ? config : config.source;
        },
        parse: function(v, obj, attrs, key) {
            /*
            Example:
            --------
            var Thing = Traits.Model.extend({
                traits: {
                    allColors: new t.Collection(),
                    favoriteColor: new t.CollectionModel({source: 'allColors'})
                }
            });
                    
            >>> var i = Traits.CollectionModel({source: 'colors'})
            >>> i.parse('red')
            <ColorModel color=red>
            >>> i.parse(colorRed) 
            <ColorModel color=red>       
            >>> i.parse('banana')        ValueError
            >>> i.parse(['banana'])      TypeError
            >>> i.parse(null)        
            null
            >>> i.parse(undefined)
            null            
            >>> i.parse('')              Todo: throw ValueError?
            null                         
            >>> i.parse({foo:'bar'})     ValueError
            >>> i.parse({id:'banana'})   ValueError('banana invalid value')!
            >>> i.parse({id:'red', foo: 'bar'})
            >>> i.parse({id:null, foo: 'bar'}) 
            <ColorModel color=red>
            */
            if(v == null || v === '') 
                return null;            
            if(v.id)
                v = v.id
            if(_.isNumber(v))
                v = String(v);
            if(!_.isString(v))
                throw new TypeError('Expected string or number, got '+v);
            if(!v && v !== 0) 
                throw new ValueError('No id')
            
            var s = this.source;
            if(_.isString(s)) {         
                s = obj.get(s);
                if(!s) 
                    s = attrs[this.source];
            }
            var model = s.get(v);
            if(!model)
                throw new ValueError(v + ' not in ' + this.source);
            return model;
        },
        toJSON: function(v, obj) {
            // 'v' is a model
            if(v)
                return v.toJSON();
        }        
    })

    
    return Traits;
});