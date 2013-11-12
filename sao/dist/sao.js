/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
var Sao = {};

(function() {
    'use strict';

    // Browser compatibility: polyfill
    if (!('contains' in String.prototype)) {
        String.prototype.contains = function(str, startIndex) {
            return -1 !== String.prototype.indexOf.call(this, str, startIndex);
        };
    }
    if (!String.prototype.startsWith) {
        Object.defineProperty(String.prototype, 'startsWith', {
            enumerable: false,
            configurable: false,
            writable: false,
            value: function(searchString, position) {
                position = position || 0;
                return this.indexOf(searchString, position) === position;
            }
        });
    }
    if (!String.prototype.endsWith) {
        Object.defineProperty(String.prototype, 'endsWith', {
            enumerable: false,
            configurable: false,
            writable: false,
            value: function(searchString, position) {
                position = position || this.length;
                position = position - searchString.length;
                var lastIndex = this.lastIndexOf(searchString);
                return lastIndex !== -1 && lastIndex === position;
            }
        });
    }

    Sao.error = function(title, message) {
        alert(title + '\n' + (message || ''));
    };

    Sao.warning = function(title, message) {
        alert(title + '\n' + (message || ''));
    };

    Sao.class_ = function(Parent, props) {
        var ClassConstructor = function() {
            if (!(this instanceof ClassConstructor))
                throw new Error('Constructor function requires new operator');
            if (this.init) {
                this.init.apply(this, arguments);
            }
        };

        // Plug prototype chain
        ClassConstructor.prototype = Object.create(Parent.prototype);
        ClassConstructor._super = Parent.prototype;
        if (props) {
            for (var name in props) {
                ClassConstructor.prototype[name] = props[name];
            }
        }
        return ClassConstructor;
    };

    Sao.Decimal = Number;

    Sao.Date = function(year, month, day) {
        var date;
        if (year === undefined) {
            date = new Date();
        } else if (month === undefined) {
            date = new Date(year);
        } else {
            date = new Date(year, month, day);
        }
        date.isDate = true;
        var previous_day = date.getDate();
        var previous_hour = date.getHours();
        date.setHours(0);
        // Setting hours could change the day due to local timezone
        if (previous_day != date.getDate()) {
            date.setDate(previous_day);
            date.setHours(previous_hour);
        }
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date;
    };

    Sao.DateTime = function(year, month, day, hour, minute, second) {
        var datetime;
        if (year === undefined) {
            datetime = new Date();
        } else if (month === undefined) {
            datetime = new Date(year);
        } else {
            datetime = new Date(year, month, day,
                    hour || 0, minute || 0, second || 0);
        }
        datetime.isDateTime = true;
        datetime.setMilliseconds(0);
        return datetime;
    };

    Sao.Time = Sao.class_(Object, {
        init: function(hour, minute, second) {
            this.date = new Date(0, 0, 0, hour, minute, second);
        },
        getHours: function() {
            return this.date.getHours();
        },
        setHours: function(hour) {
            this.date.setHours(hour);
        },
        getMinutes: function() {
            return this.date.getMinutes();
        },
        setMinutes: function(minute) {
            this.date.setMinutes(minute);
        },
        getSeconds: function() {
            return this.date.getSeconds();
        },
        setSeconds: function(second) {
            this.date.setSeconds(second);
        },
        valueOf: function() {
            return this.date.valueOf();
        }
    });

    Sao.config = {};
    Sao.config.limit = 1000;
    Sao.config.display_size = 20;

    Sao.login = function() {
        var dfd = jQuery.Deferred();
        Sao.Session.get_credentials(dfd);
        dfd.then(function(session) {
            Sao.Session.current_session = session;
            session.reload_context();
            return session;
        }).then(function(session) {
            Sao.rpc({
                'method': 'model.res.user.get_preferences',
                'params': [false, {}]
            }, session).then(function(preferences) {
                var deferreds = [];
                // TODO view_search
                deferreds.push(Sao.common.MODELACCESS.load_models());
                deferreds.push(Sao.common.ICONFACTORY.load_icons());
                jQuery.when.apply(jQuery, deferreds).then(function() {
                    Sao.menu(preferences);
                    Sao.user_menu(preferences);
                });
            });
        });
    };

    Sao.logout = function() {
        var session = Sao.Session.current_session;
        // TODO check modified
        jQuery('#tabs').children().remove();
        jQuery('#user-preferences').children().remove();
        jQuery('#user-logout').children().remove();
        jQuery('#menu').children().remove();
        if (Sao.main_menu_screen) {
            Sao.main_menu_screen.save_tree_state();
            Sao.main_menu_screen = null;
        }
        session.do_logout();
        Sao.login();
    };

    Sao.preferences = function() {
        // TODO check modified
        jQuery('#tabs').children().remove();
        jQuery('#user-preferences').children().remove();
        jQuery('#user-logout').children().remove();
        jQuery('#menu').children().remove();
        new Sao.Window.Preferences(function() {
            var session = Sao.Session.current_session;
            session.reload_context().done(
                Sao.rpc({
                    'method': 'model.res.user.get_preferences',
                    'params': [false, {}]
                }, session).then(function(preferences) {
                    Sao.menu(preferences);
                    Sao.user_menu(preferences);
                }));
        });
    };

    Sao.user_menu = function(preferences) {
        jQuery('#user-preferences').append(jQuery('<a/>', {
            'href': '#'
        }).click(Sao.preferences).append(preferences.status_bar));
        jQuery('#user-logout').append(jQuery('<a/>', {
            'href': '#'
        }).click(Sao.logout).append('Logout'));
    };

    Sao.menu = function(preferences) {
        var decoder = new Sao.PYSON.Decoder();
        var action = decoder.decode(preferences.pyson_menu);
        var view_ids = false;
        if (!jQuery.isEmptyObject(action.views)) {
            view_ids = action.views.map(function(view) {
                return view[0];
            });
        } else if (action.view_id) {
            view_ids = [action.view_id[0]];
        }
        decoder = new Sao.PYSON.Decoder(Sao.Session.current_session.context);
        var domain = decoder.decode(action.pyson_domain);
        var form = new Sao.Tab.Form(action.res_model, {
            'mode': ['tree'],
            'view_ids': view_ids,
            'domain': domain,
            'selection_mode': Sao.common.SELECTION_NONE
        });
        form.view_prm.done(function() {
            Sao.main_menu_screen = form.screen;
            var view = form.screen.current_view;
            view.table.find('th').hide();
            jQuery('#menu').append(
                form.screen.screen_container.content_box.detach());
        });
    };
    Sao.main_menu_screen = null;

}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.rpc = function(args, session) {
        var dfd = jQuery.Deferred();
        if (!session) {
            session = new Sao.Session();
        }
        var params = jQuery.extend([], args.params);
        params.push(jQuery.extend({}, session.context, params.pop()));

        var ajax_prm = jQuery.ajax({
            'contentType': 'application/json',
            'data': JSON.stringify(Sao.rpc.prepareObject({
                'method': args.method,
                'params': [session.user_id, session.session].concat(params)
            })),
            'dataType': 'json',
            'url': '/' + (session.database || ''),
            'type': 'post'
        });

        var ajax_success = function(data) {
            if (data === null) {
                Sao.warning('Unable to reach the server');
                dfd.reject();
            } else if (data.error) {
                if (data.error[0] == 'UserWarning') {
                } else if (data.error[0] == 'UserError') {
                    // TODO
                } else if (data.error[0] == 'ConcurrencyException') {
                    // TODO
                } else if (data.error[0] == 'NotLogged') {
                    //Try to relog
                    Sao.Session.renew(session).then(function() {
                        Sao.rpc(args, session).then(dfd.resolve, dfd.reject);
                    }, dfd.reject);
                    return;
                } else {
                    console.log('ERROR');
                    Sao.error(data.error[0], data.error[1]);
                }
                dfd.reject();
            } else {
                dfd.resolve(data.result);
            }
        };

        var ajax_error = function() {
            console.log('ERROR');
            dfd.reject();
        };
        ajax_prm.success(ajax_success);
        ajax_prm.error(ajax_error);

        return dfd.promise();
    };

    Sao.rpc.convertJSONObject = function(value, index, parent) {
       if (value instanceof Array) {
           for (var i = 0, length = value.length; i < length; i++) {
               Sao.rpc.convertJSONObject(value[i], i, value);
           }
       } else if ((typeof(value) != 'string') &&
           (typeof(value) != 'number') && (value !== null)) {
           if (value && value.__class__) {
               switch (value.__class__) {
                   case 'datetime':
                       value = Sao.DateTime(Date.UTC(value.year,
                               value.month - 1, value.day, value.hour,
                               value.minute, value.second));
                       break;
                   case 'date':
                       value = Sao.Date(value.year,
                           value.month - 1, value.day);
                       break;
                   case 'time':
                       value = new Sao.Time(value.hour, value.minute,
                               value.second);
                       break;
                   case 'buffer':
                       // javascript's atob does not understand linefeed
                       // characters
                       var byte_string = atob(value.base64.replace(/\s/g, ''));
                       // javascript decodes base64 string as a "DOMString", we
                       // need to convert it to an array of bytes
                       var array_buffer = new ArrayBuffer(byte_string.length);
                       var uint_array = new Uint8Array(array_buffer);
                       for (var j=0; j < byte_string.length; j++) {
                           uint_array[j] = byte_string.charCodeAt(j);
                       }
                       value = uint_array;
                       break;
                   case 'Decimal':
                       value = new Sao.Decimal(value.decimal);
                       break;
               }
               if (parent) {
                   parent[index] = value;
               }
           } else {
               for (var p in value) {
                   Sao.rpc.convertJSONObject(value[p], p, value);
               }
           }
       }
       return parent || value;
    };

    Sao.rpc.prepareObject = function(value, index, parent) {
        if (value instanceof Array) {
            for (var i = 0, length = value.length; i < length; i++) {
                Sao.rpc.prepareObject(value[i], i, value);
            }
        } else if ((typeof(value) != 'string') &&
                (typeof(value) != 'number') && (value !== null)) {
            if (value instanceof Date) {
                if (value.isDate){
                    value = {
                        '__class__': 'date',
                        'year': value.getFullYear(),
                        'month': value.getMonth() + 1,
                        'day': value.getDate()
                    };
                } else {
                    value = {
                        '__class__': 'datetime',
                        'year': value.getUTCFullYear(),
                        'month': value.getUTCMonth() + 1,
                        'day': value.getUTCDate(),
                        'hour': value.getUTCHours(),
                        'minute': value.getUTCMinutes(),
                        'second': value.getUTCSeconds()
                    };
                }
                if (parent) {
                    parent[index] = value;
                }
            } else if (value instanceof Sao.Time) {
                value = {
                    '__class__': 'time',
                    'hour': value.getHours(),
                    'minute': value.getMinutes(),
                    'second': value.getSeconds()
                };
            } else if (value instanceof Sao.Decimal) {
                value = {
                    '__class__': 'Decimal',
                    'decimal': value.valueOf()
                };
                if (parent) {
                    parent[index] = value;
                }
            } else if (value instanceof Uint8Array) {
                value = {
                    '__class__': 'buffer',
                    'base64': btoa(String.fromCharCode.apply(null, value))
                };
                if (parent) {
                    parent[index] = value;
                }
            } else {
                for (var p in value) {
                    Sao.rpc.prepareObject(value[p], p, value);
                }
            }
        }
        return parent || value;
    };

    jQuery.ajaxSetup({
        converters: {
           'text json': function(json) {
               return Sao.rpc.convertJSONObject(jQuery.parseJSON(json));
           }
        }
    });
}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.PYSON = {};

    Sao.PYSON.PYSON = Sao.class_(Object, {
        init: function() {
        },
        pyson: function() {
            throw 'NotImplementedError';
        },
        types: function() {
            throw 'NotImplementedError';
        }
    });

    Sao.PYSON.PYSON.eval_ = function(value, context) {
        throw 'NotImplementedError';
    };

    Sao.PYSON.Encoder = Sao.class_(Object, {
        encode: function(pyson) {
            return JSON.stringify(pyson, function(k, v) {
                if (v instanceof Sao.PYSON.PYSON) {
                    return v.pyson();
                } else if (v instanceof Date) {
                    if (v.isDate) {
                        return Sao.PYSON.Date(
                            v.getFullYear(),
                            v.getMonth(),
                            v.getDate()).pyson();
                    } else {
                        return Sao.PYSON.DateTime(
                            v.getFullYear(),
                            v.getMonth(),
                            v.getDate(),
                            v.getHours(),
                            v.getMinutes(),
                            v.getSeconds(),
                            v.getMilliseconds()).pyson();
                    }
                }
                return v;
            });
        }
    });

    Sao.PYSON.Decoder = Sao.class_(Object, {
        init: function(context) {
            this.__context = context || {};
        },
        decode: function(str) {
            var reviver = function(k, v) {
                if (typeof v == 'object' && v !== null) {
                    var cls = Sao.PYSON[v.__class__];
                    if (cls) {
                        return cls.eval_(v, this.__context);
                    }
                }
                return v;
            };
            return JSON.parse(str, reviver.bind(this));
        }
    });

    Sao.PYSON.Eval = Sao.class_(Sao.PYSON.PYSON, {
        init: function(value, default_) {
            if (default_ === undefined) {
                default_ = '';
            }
            Sao.PYSON.Eval._super.init.call(this);
            this._value = value;
            this._default = default_;
        },
        pyson: function() {
            return {
                '__class__': 'Eval',
                'v': this._value,
                'd': this._default
            };
        },
        types: function() {
            if (this._default instanceof Sao.PYSON.PYSON) {
                return this._default.types();
            } else {
                return [typeof this._default];
            }
        }
    });

    Sao.PYSON.Eval.eval_ = function(value, context) {
        if (value.v in context) {
            return context[value.v];
        } else {
            return value.d;
        }
    };

    Sao.PYSON.Not = Sao.class_(Sao.PYSON.PYSON, {
        init: function(value) {
            Sao.PYSON.Not._super.init.call(this);
            if (value instanceof Sao.PYSON.PYSON) {
                if (jQuery(value.types()).not(['boolean']).length ||
                    jQuery(['boolean']).not(value.types()).length) {
                    throw 'value must be boolean';
                    }
            } else {
                if (typeof value != 'boolean') {
                    throw 'value must be boolean';
                }
            }
            this._value = value;
        },
        pyson: function() {
            return {
                '__class__': 'Not',
                'v': this._value
                };
        },
        types: function() {
            return ['boolean'];
        }
    });

    Sao.PYSON.Not.eval_ = function(value, context) {
        return !value.v;
    };

    Sao.PYSON.Bool = Sao.class_(Sao.PYSON.PYSON, {
        init: function(value) {
            Sao.PYSON.Bool._super.init.call(this);
            this._value = value;
        },
        pyson: function() {
            return {
                '__class__': 'Bool',
                'v': this._value
                };
        },
        types: function() {
            return ['boolean'];
        }
    });

    Sao.PYSON.Bool.eval_ = function(value, context) {
        if (value.v instanceof Object) {
            return !jQuery.isEmptyObject(value.v);
        } else {
            return Boolean(value.v);
        }
    };


    Sao.PYSON.And = Sao.class_(Sao.PYSON.PYSON, {
        init: function(statements) {
            Sao.PYSON.And._super.init.call(this);
            for (var i = 0, len = statements.length; i < len; i++) {
                var statement = statements[i];
                if (statement instanceof Sao.PYSON.PYSON) {
                    if (jQuery(statement.types()).not(['boolean']).length ||
                        jQuery(['boolean']).not(statement.types()).length) {
                        throw 'statement must be boolean';
                        }
                } else {
                    if (typeof statement != 'boolean') {
                        throw 'statement must be boolean';
                    }
                }
            }
            if (statements.length < 2) {
                throw 'must have at least 2 statements';
            }
            this._statements = statements;
        },
        pyson: function() {
            return {
                '__class__': 'And',
                's': this._statements
            };
        },
        types: function() {
            return ['boolean'];
        }
    });

    Sao.PYSON.And.eval_ = function(value, context) {
        var result = true;
        for (var i = 0, len = value.s.length; i < len; i++) {
            var statement = value.s[i];
            result = result && statement;
        }
        return result;
    };


    Sao.PYSON.Or = Sao.class_(Sao.PYSON.And, {
        pyson: function() {
            var result = Sao.PYSON.Or._super.pyson.call(this);
            result.__class__ = 'Or';
            return result;
        }
    });

    Sao.PYSON.Or.eval_ = function(value, context) {
        var result = false;
        for (var i = 0, len = value.s.length; i < len; i++) {
            var statement = value.s[i];
            result = result || statement;
        }
        return result;
    };

    Sao.PYSON.Equal = Sao.class_(Sao.PYSON.PYSON, {
        init: function(statement1, statement2) {
            Sao.PYSON.Equal._super.init.call(this);
            var types1, types2;
            if (statement1 instanceof Sao.PYSON.PYSON) {
                types1 = statement1.types();
            } else {
                types1 = [typeof statement1];
            }
            if (statement2 instanceof Sao.PYSON.PYSON) {
                types2 = statement2.types();
            } else {
                types2 = [typeof statement2];
            }
            if (jQuery(types1).not(types2).length ||
                jQuery(types2).not(types1).length) {
                throw 'statements must have the same type';
                }
            this._statement1 = statement1;
            this._statement2 = statement2;
        },
        pyson: function() {
            return {
                '__class__': 'Equal',
                's1': this._statement1,
                's2': this._statement2
            };
        },
        types: function() {
            return ['boolean'];
        }
    });

    Sao.PYSON.Equal.eval_ = function(value, context) {
        return value.s1 == value.s2;
    };

    Sao.PYSON.Greater = Sao.class_(Sao.PYSON.PYSON, {
        init: function(statement1, statement2, equal) {
            Sao.PYSON.Greater._super.init.call(this);
            var statements = [statement1, statement2];
            for (var i = 0; i < 2; i++) {
                var statement = statements[i];
                if (statement instanceof Sao.PYSON.PYSON) {
                    if (jQuery(statement).not(['number']).length) {
                        throw 'statement must be an integer or a float';
                    }
                } else {
                    if (typeof statement != 'number') {
                        throw 'statement must be an integer or a float';
                    }
                }
            }
            if (equal === undefined) {
                equal = false;
            }
            if (equal instanceof Sao.PYSON.PYSON) {
                if (jQuery(equal.types()).not(['boolean']).length ||
                    jQuery(['boolean']).not(equal.types()).length) {
                    throw 'equal must be boolean';
                    }
            } else {
                if (typeof equal != 'boolean') {
                    throw 'equal must be boolean';
                }
            }
            this._statement1 = statement1;
            this._statement2 = statement2;
            this._equal = equal;
        },
        pyson: function() {
            return {
                '__class__': 'Greater',
                's1': this._statement1,
                's2': this._statement2,
                'e': this._equal
            };
        },
        types: function() {
            return ['boolean'];
        }
    });

    Sao.PYSON.Greater._convert = function(value) {
        value = jQuery.extend({}, value);
        value.s1 = Number(value.s1);
        value.s2 = Number(value.s2);
        return value;
    };

    Sao.PYSON.Greater.eval_ = function(value, context) {
        value = Sao.PYSON.Greater._convert(value);
        if (value.e) {
            return value.s1 >= value.s2;
        } else {
            return value.s1 > value.s2;
        }
    };

    Sao.PYSON.Less = Sao.class_(Sao.PYSON.Greater, {
        pyson: function() {
            var result = Sao.PYSON.Less._super.pyson.call(this);
            result.__class__ = 'Less';
            return result;
        }
    });

    Sao.PYSON.Less._convert = Sao.PYSON.Greater._convert;

    Sao.PYSON.Less.eval_ = function(value, context) {
        value = Sao.PYSON.Less._convert(value);
        if (value.e) {
            return value.s1 <= value.s2;
        } else {
            return value.s1 < value.s2;
        }
    };

    Sao.PYSON.If = Sao.class_(Sao.PYSON.PYSON, {
        init: function(condition, then_statement, else_statement) {
            Sao.PYSON.If._super.init.call(this);
            if (condition instanceof Sao.PYSON.PYSON) {
                if (jQuery(condition.types()).not(['boolean']).length ||
                    jQuery(['boolean']).not(condition.types()).length) {
                    throw 'condition must be boolean';
                }
            } else {
                if (typeof condition != 'boolean') {
                    throw 'condition must be boolean';
                }
            }
            var then_types, else_types;
            if (then_statement instanceof Sao.PYSON.PYSON) {
                then_types = then_statement.types();
            } else {
                then_types = [typeof then_statement];
            }
            if (else_statement === undefined) {
                else_statement = null;
            }
            if (else_statement instanceof Sao.PYSON.PYSON) {
                else_types = else_statement.types();
            } else {
                else_types = [typeof else_statement];
            }
            if (jQuery(then_types).not(else_types).length ||
                jQuery(else_types).not(then_types).length) {
                throw 'then and else statements must be the same type';
            }
            this._condition = condition;
            this._then_statement = then_statement;
            this._else_statement = else_statement;
        },
        pyson: function() {
            return {
                '__class__': 'If',
                'c': this._condition,
                't': this._then_statement,
                'e': this._else_statement
            };
        },
        types: function() {
            if (this._then_statement instanceof Sao.PYSON.PYSON) {
                return this._then_statement.types();
            } else {
                return [typeof this._then_statement];
            }
        }
    });

    Sao.PYSON.If.eval_ = function(value, context) {
        if (value.c) {
            return value.t;
        } else {
            return value.e;
        }
    };

    Sao.PYSON.Get = Sao.class_(Sao.PYSON.PYSON, {
        init: function(obj, key, default_) {
            Sao.PYSON.Get._super.init.call(this);
            if (default_ === undefined) {
                default_ = null;
            }
            if (obj instanceof Sao.PYSON.PYSON) {
                if (jQuery(obj.types()).not(['object']).length ||
                    jQuery(['object']).not(obj.types()).length) {
                    throw 'obj must be a dict';
                }
            } else {
                if (!(obj instanceof Object)) {
                    throw 'obj must be a dict';
                }
            }
            this._obj = obj;
            if (key instanceof Sao.PYSON.PYSON) {
                if (jQuery(key.types()).not(['string']).length ||
                    jQuery(['string']).not(key.types()).length) {
                    throw 'key must be a string';
                }
            } else {
                if (typeof key != 'string') {
                    throw 'key must be a string';
                }
            }
            this._key = key;
            this._default = default_;
        },
        pyson: function() {
            return {
                '__class__': 'Get',
                'v': this._obj,
                'k': this._key,
                'd': this._default
            };
        },
        types: function() {
            if (this._default instanceof Sao.PYSON.PYSON) {
                return this._default.types();
            } else {
                return [typeof this._default];
            }
        }
    });

    Sao.PYSON.Get.eval_ = function(value, context) {
        if (value.k in value.v) {
            return value.v[value.k];
        } else {
            return value.d;
        }
    };

    Sao.PYSON.In = Sao.class_(Sao.PYSON.PYSON, {
        init: function(key, obj) {
            Sao.PYSON.In._super.init.call(this);
            if (key instanceof Sao.PYSON.PYSON) {
                if (jQuery(key.types()).not(['string', 'number']).length) {
                    throw 'key must be a string or a number';
                }
            } else {
                if (!~['string', 'number'].indexOf(typeof key)) {
                    throw 'key must be a string or a number';
                }
            }
            if (obj instanceof Sao.PYSON.PYSON) {
                if (jQuery(obj.types()).not(['object']).length ||
                    jQuery(['object']).not(obj.types()).length) {
                    throw 'obj must be a dict or a list';
                }
            } else {
                if (!(obj instanceof Object)) {
                    throw 'obj must be a dict or a list';
                }
            }
            this._key = key;
            this._obj = obj;
        },
        pyson: function() {
            return {'__class__': 'In',
                'k': this._key,
                'v': this._obj
            };
        },
        types: function() {
            return ['boolean'];
        }
    });

    Sao.PYSON.In.eval_ = function(value, context) {
        if (value.v.indexOf) {
            return Boolean(~value.v.indexOf(value.k));
        } else {
            return !!value.v[value.k];
        }
    };

    Sao.PYSON.Date = Sao.class_(Sao.PYSON.PYSON, {
        init: function(year, month, day, delta_years, delta_months, delta_days)
        {
            Sao.PYSON.Date._super.init.call(this);
            if (year === undefined) year = null;
            if (month === undefined) month = null;
            if (day === undefined) day = null;
            if (delta_years === undefined) delta_years = 0;
            if (delta_months === undefined) delta_months = 0;
            if (delta_days === undefined) delta_days = 0;

            this._test(year, 'year');
            this._test(month, 'month');
            this._test(day, 'day');
            this._test(delta_years, 'delta_years');
            this._test(delta_days, 'delta_days');
            this._test(delta_months, 'delta_months');

            this._year = year;
            this._month = month;
            this._day = day;
            this._delta_years = delta_years;
            this._delta_months = delta_months;
            this._delta_days = delta_days;
        },
        pyson: function() {
            return {
                '__class__': 'Date',
                'y': this._year,
                'M': this._month,
                'd': this._day,
                'dy': this._delta_years,
                'dM': this._delta_months,
                'dd': this._delta_days
            };
        },
        types: function() {
            return ['object'];
        },
        _test: function(value, name) {
            if (value instanceof Sao.PYSON.PYSON) {
                if (jQuery(value.types()).not(
                        ['number', typeof null]).length) {
                    throw name + ' must be an integer or None';
                }
            } else {
                if ((typeof value != 'number') && (value !== null)) {
                    throw name + ' must be an integer or None';
                }
            }
        }
    });

    Sao.PYSON.Date.eval_ = function(value, context) {
        var date = Sao.Date();
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        date.setMilliseconds(0);
        if (value.y) date.setFullYear(value.y);
        if (value.M) date.setMonth(value.M - 1);
        if (value.d) date.setDate(value.d);
        var year = date.getFullYear();
        var month = date.getMonth();
        var day = date.getDate();
        if (value.dy) date.setFullYear(year + value.dy);
        if (value.dM) date.setMonth(month + value.dM);
        if (value.dd) date.setDate(day + value.dd);
        return date;
    };

    Sao.PYSON.DateTime = Sao.class_(Sao.PYSON.Date, {
        init: function(year, month, day, hour, minute, second, microsecond,
                  delta_years, delta_months, delta_days, delta_hours,
                  delta_minutes, delta_seconds, delta_microseconds) {
            Sao.PYSON.DateTime._super.init.call(this, year, month, day,
                delta_years, delta_months, delta_days);
            if (hour === undefined) hour = null;
            if (minute === undefined) minute = null;
            if (second === undefined) second = null;
            if (microsecond === undefined) microsecond = null;
            if (delta_hours === undefined) delta_hours = 0;
            if (delta_minutes === undefined) delta_minutes = 0;
            if (delta_seconds === undefined) delta_seconds = 0;
            if (delta_microseconds === undefined) delta_microseconds = 0;

            this._test(hour, 'hour');
            this._test(minute, 'minute');
            this._test(second, 'second');
            this._test(microsecond, 'microsecond');
            this._test(delta_hours, 'delta_hours');
            this._test(delta_minutes, 'delta_minutes');
            this._test(delta_seconds, 'delta_seconds');
            this._test(delta_microseconds, 'delta_microseconds');

            this._hour = hour;
            this._minute = minute;
            this._second = second;
            this._microsecond = microsecond;
            this._delta_hours = delta_hours;
            this._delta_minutes = delta_minutes;
            this._delta_seconds = delta_seconds;
            this._delta_microseconds = delta_microseconds;
        },
        pyson: function() {
            var result = Sao.PYSON.DateTime._super.pyson.call(this);
            result.__class__ = 'DateTime';
            result.h = this._hour;
            result.m = this._minute;
            result.s = this._second;
            result.ms = this._microsecond;
            result.dh = this._delta_hours;
            result.dm = this._delta_minutes;
            result.ds = this._delta_seconds;
            result.dms = this._delta_microseconds;
            return result;
        }
    });

    Sao.PYSON.DateTime.eval_ = function(value, context) {
        var date = Sao.DateTime();
        if (value.y) date.setFullYear(value.y);
        if (value.M) date.setMonth(value.M - 1);
        if (value.d) date.setDate(value.d);
        if (value.h !== undefined) date.setHours(value.h);
        if (value.m !== undefined) date.setMinutes(value.m);
        if (value.s !== undefined) date.setSeconds(value.s);
        if (value.ms !== undefined) date.setMilliseconds(value.ms / 100);
        var year = date.getFullYear();
        var month = date.getMonth();
        var day = date.getDate();
        var hour = date.getHours();
        var minute = date.getMinutes();
        var second = date.getSeconds();
        var millisecond = date.getMilliseconds();
        if (value.dy) date.setFullYear(year + value.dy);
        if (value.dM) date.setMonth(month + value.dM);
        if (value.dd) date.setDate(day + value.dd);
        if (value.dh) date.setHours(hour + value.dh);
        if (value.dm) date.setMinutes(minute + value.dm);
        if (value.ds) date.setSeconds(second + value.ds);
        if (value.dms) date.setMilliseconds(millisecond + value.dms / 100);
        return date;
    };
}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.parse_cookie = function() {
        var cookie = {};
        var parts = document.cookie.split('; ');
        for (var i = 0, length = parts.length; i < length; i++) {
            var part = parts[i].split('=');
            if (part.length != 2) {
                continue;
            }
            cookie[part[0]] = part[1];
        }
        return cookie;
    };


    Sao.set_cookie = function(values) {
        for (var name in values) {
            if (!values.hasOwnProperty(name)) {
                continue;
            }
            var value = values[name];
            document.cookie = name + '=' + value;
        }
    };

    Sao.Session = Sao.class_(Object, {
       init: function(database, login) {
           this.user_id = null;
           this.session = null;
            if (!database && !login) {
                var cookie = Sao.parse_cookie();
                this.database = cookie.database;
                this.login = cookie.login;
            } else {
                this.database = database;
                this.login = login;
            }
            this.context = {};
            if (!Sao.Session.current_session) {
                Sao.Session.current_session = this;
            }
        },
        do_login: function(login, password) {
            var dfd = jQuery.Deferred();
            var args = {
                'method': 'common.db.login',
                'params': [login, password]
            };
            var ajax_prm = jQuery.ajax({
                'contentType': 'application/json',
                'data': JSON.stringify(args),
                'dataType': 'json',
                'url': '/' + this.database,
                'type': 'post'
            });

            var ajax_success = function(data) {
                if (data === null) {
                    Sao.warning('Unable to reach the server');
                    dfd.reject();
                } else if (data.error) {
                    console.log('ERROR');
                    Sao.error(data.error[0], data.error[1]);
                    dfd.reject();
                } else {
                    if (!data.result) {
                        this.user_id = null;
                        this.session = null;
                    } else {
                        this.user_id = data.result[0];
                        this.session = data.result[1];
                        Sao.set_cookie({
                            'login': this.login,
                            'database': this.database
                        });
                    }
                    dfd.resolve();
                }
            };
            ajax_prm.success(ajax_success.bind(this));
            ajax_prm.error(dfd.reject);
            return dfd.promise();
        },
        do_logout: function() {
            if (!(this.user_id && this.session)) {
                return;
            }
            var args = {
                'method': 'common.db.logout',
                'params': []
            };
            var prm = Sao.rpc(args, this);
            this.database = null;
            this.login = null;
            this.user_id = null;
            this.session = null;
            return prm;
        },
        reload_context: function() {
            var args = {
                'method': 'model.res.user.get_preferences',
                'params': [true, {}]
            };
            var prm = Sao.rpc(args, this);
            return prm.then(function(context) {
                this.context = context;
            }.bind(this));
        }
    });

    Sao.Session.get_credentials = function(parent_dfd) {
        var cookie = Sao.parse_cookie();
        var login = cookie.login;
        var database = window.location.hash.replace(
                /^(#(!|))/, '') || null;
        var database_div, database_select;
        var login_div, login_input, password_input;

        var ok_func = function() {
            var login_val = login_input.val();
            var password_val = password_input.val();
            var database_val = (database ||
                    database_select.val());
            if (!(login_val && password_val)) {
                return;
            }
            var session = new Sao.Session(database_val,
                    login_val);
            var prm = session.do_login(login_val, password_val);
            prm.done(function() {
                parent_dfd.resolve(session);
            });
            login_div.dialog('close');
        };

        var keydown = function(ev) {
            if (ev.which === 13)
                ok_func();
        };

        var fill_database = function() {
            jQuery.when(Sao.DB.list()).then(function(databases) {
                databases.forEach(function(database) {
                    database_select.append(jQuery('<option/>', {
                        'value': database,
                        'text': database
                    }));
                });
            }).then(function() {
                database_select.val(cookie.database);
            });
        };

        login_div = jQuery('<div/>', {
            'class': 'login'
        });
        if (!database) {
            login_div.append(jQuery('<label/>', {
                'text': 'Database:' // TODO translation
            }));
            database_select = jQuery('<select/>');
            login_div.append(database_select);
            fill_database();
            login_div.append(jQuery('<br/>'));
        }

        login_div.append(jQuery('<label/>', {
            'text': 'Login:' // TODO translation
        }));
        login_input = jQuery('<input/>', {
            'type': 'input',
                    'id': 'login',
                    'val': login
        });
        login_input.keydown(keydown);
        login_div.append(login_input);
        login_div.append(jQuery('<br/>'));

        login_div.append(jQuery('<label/>', {
            'text': 'Password:'
        }));
        password_input = jQuery('<input/>', {
            'type': 'password',
                       'id': 'password'
        });
        password_input.keydown(keydown);
        login_div.append(password_input);
        login_div.append(jQuery('<br/>'));

        login_div.dialog({
            'title': 'Login', // TODO translation
            'modal': true,
            'buttons': {
                'Cancel': function() {
                    jQuery(this).dialog('close');
                },
            'OK': ok_func
            },
            'open': function() {
                if (login) {
                    password_input.focus();
                } else {
                    login_input.focus();
                }
            }
        });

    };

    Sao.Session.renew = function(session) {
        var dfd = jQuery.Deferred();
        var login_div, password_input;

        var ok_func = function() {
            var password_val = password_input.val();
            session.do_login(session.login, password_val).done(function() {
                dfd.resolve();
            });
            login_div.dialog('close');
        };
        var keydown = function(ev) {
            if (ev.which === 13)
                ok_func();
        };

        login_div = jQuery('<div/>', {
            'class': 'login'
        });
        login_div.append(jQuery('<label/>', {
            'text': 'Password:'
        }));
        password_input = jQuery('<input/>', {
            'type': 'password',
                       'id': 'password'
        });
        password_input.keydown(keydown);
        login_div.append(password_input);
        login_div.append(jQuery('<br/>'));

        login_div.dialog({
            'title': 'Login', // TODO translation
            'modal': true,
            'buttons': {
                'Cancel': function() {
                    jQuery(this).dialog('close');
                },
            'OK': ok_func
            },
            'open': function() {
                password_input.focus();
            }
        });
        return dfd.promise();
    };

    Sao.Session.current_session = null;

    Sao.DB = {};

    Sao.DB.list = function() {
        var args = {
            'method': 'common.db.list',
            'params': []
        };
        return Sao.rpc(args);
    };
}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.Model = Sao.class_(Object, {
        init: function(name, attributes) {
            attributes = attributes || {};
            this.name = name;
            this.session = Sao.Session.current_session;
            this.fields = {};
        },
        add_fields: function(descriptions) {
            for (var name in descriptions) {
                if (descriptions.hasOwnProperty(name) &&
                    (!(name in this.fields))) {
                        var desc = descriptions[name];
                        var Field = Sao.field.get(desc.type);
                        this.fields[name] = new Field(desc);
                    }
            }
        },
        execute: function(method, params, context) {
            var args = {
                'method': 'model.' + this.name + '.' + method,
                'params': params.concat(context)
            };
            return Sao.rpc(args, this.session);
        },
        find: function(condition, offset, limit, order, context) {
            if (!offset) offset = 0;
            var self = this;
            var prm = this.execute('search',
                    [condition, offset, limit, order], context);
            var instanciate = function(ids) {
                return Sao.Group(self, context, ids.map(function(id) {
                    return new Sao.Record(self, id);
                }));
            };
            return prm.pipe(instanciate);
        },
        delete_: function(records) {
            if (jQuery.isEmptyObject(records)) {
                return jQuery.when();
            }
            var record = records[0];
            var root_group = record.group.root_group;
            // TODO test same model
            // TODO test same root group
            records = records.filter(function(record) {
                return record.id >= 0;
            });
            var context = {};
            // TODO timestamp
            var record_ids = records.map(function(record) {
                return record.id;
            });
            // TODO reload ids
            return this.execute('delete', [record_ids], context);
        },
        copy: function(records, context) {
            if (jQuery.isEmptyObject(records)) {
                return jQuery.when();
            }
            var record_ids = records.map(function(record) {
                return record.id;
            });
            return this.execute('copy', [record_ids, {}], context);
        }
    });

    Sao.Group = function(model, context, array) {
        array.prm = jQuery.when();
        array.model = model;
        array.context = context;
        array.parent = undefined;
        array.screens = [];
        array.parent_name = '';
        array.children = [];
        array.child_name = '';
        array.parent_datetime_field = undefined;
        array.record_removed = [];
        array.record_deleted = [];
        array.forEach(function(e, i, a) {
            e.group = a;
        });
        array.load = function(ids, modified) {
            var new_records = [];
            var i, len;
            for (i = 0, len = ids.length; i < len; i++) {
                var id = ids[i];
                var new_record = this.get(id);
                if (!new_record) {
                    new_record = new Sao.Record(this.model, id);
                    new_record.group = this;
                    this.push(new_record);
                }
                new_records.push(new_record);
            }
            // Remove previously removed or deleted records
            var record_removed = [];
            var record;
            for (i = 0, len = this.record_removed.length; i < len; i++) {
                record = this.record_removed[i];
                if (!~ids.indexOf(record.id)) {
                    record_removed.push(record);
                }
            }
            this.record_removed = record_removed;
            var record_deleted = [];
            for (i = 0, len = this.record_deleted.length; i < len; i++) {
                record = this.record_deleted[i];
                if (!~ids.indexOf(record.id)) {
                    record_deleted.push(record);
                }
            }
            this.record_deleted = record_deleted;
            if (new_records.length && modified) {
                this.changed();
            }
        };
        array.get = function(id) {
            // TODO optimize
            for (var i = 0, len = this.length; i < len; i++) {
                var record = this[i];
                if (record.id == id) {
                    return record;
                }
            }
        };
        array.new_ = function(default_, id) {
            var record = new Sao.Record(this.model, id);
            record.group = this;
            if (default_) {
                record.default_get();
            }
            return record;
        };
        array.add = function(record, position) {
            if (position === undefined) {
                position = -1;
            }
            if (record.group != this) {
                record.group = this;
            }
            this.splice(position, 0, record);
            for (var record_rm in this.record_removed) {
                if (record_rm.id == record.id) {
                    this.record_removed.splice(
                            this.record_removed.indexOf(record_rm), 1);
                }
            }
            for (var record_del in this.record_deleted) {
                if (record_del.id == record.id) {
                    this.record_deleted.splice(
                            this.record_deleted.indexOf(record_del), 1);
                }
            }
            record._changed.id = true;
            this.changed();
            return record;
        };
        array.remove = function(record, remove, modified, force_remove) {
            if (modified === undefined) {
                modified = true;
            }
            var idx = this.indexOf(record);
            if (record.id >= 0) {
                if (remove) {
                    if (~this.record_deleted.indexOf(record)) {
                        this.record_deleted.splice(
                                this.record_deleted.indexOf(record), 1);
                    }
                    this.record_removed.push(record);
                } else {
                    if (~this.record_removed.indexOf(record)) {
                        this.record_removed.splice(
                                this.record_removed.indexOf(record), 1);
                    }
                    this.record_deleted.push(record);
                }
            }
            if (record.group.parent) {
                record.group.parent._changed.id = true;
            }
            if (modified) {
                record._changed.id = true;
            }
            if (!(record.group.parent) || (record.id < 0) || force_remove) {
                this._remove(record);
            }
            record.group.changed();
            record.group.root_group().screens.forEach(function(screen) {
                screen.display();
            });
        };
        array._remove = function(record) {
            var idx = this.indexOf(record);
            this.splice(idx, 1);
        };
        array.unremove = function(record) {
            this.record_removed.splice(this.record_removed.indexOf(record), 1);
            this.record_deleted.splice(this.record_deleted.indexOf(record), 1);
            record.group.changed();
            record.group.root_group().screens.forEach(function(screen) {
                screen.display();
            });
        };
        array.changed = function() {
            if (!this.parent) {
                return jQuery.when();
            }
            this.parent._changed[this.child_name] = true;
            var prm = jQuery.Deferred();
            this.parent.model.fields[this.child_name].changed(this.parent).then(
                    function() {
                        // TODO validate parent
                        this.parent.group.changed().done(prm.resolve);
                    }.bind(this));
            return prm;
        };
        array.root_group = function() {
            var root = this;
            var parent = this.parent;
            while (parent) {
                root = parent.group;
                parent = parent.parent;
            }
            return root;
        };
        array.save = function() {
            var deferreds = [];
            this.forEach(function(record) {
                deferreds.push(record.save());
            });
            if (!jQuery.isEmptyObject(this.record_deleted)) {
                deferreds.push(this.model.delete_(this.record_deleted));
            }
            return jQuery.when.apply(jQuery, deferreds);
        };
        array.written = function(ids) {
            // TODO
        };
        array.reload = function(ids) {
            this.children.forEach(function(child) {
                child.reload(ids);
            });
            ids.forEach(function(id) {
                var record = this.get(id);
                if (record && jQuery.isEmptyObject(record._changed)) {
                    record._loaded = {};
                }
            }.bind(this));
        };
        array.set_parent = function(parent) {
            this.parent = parent;
            if (parent && parent.model_name == this.model.name) {
                this.parent.group.children.push(this);
            }
        };
        array.destroy = function() {
            if (this.parent) {
                var i = this.parent.group.children.indexOf(this);
                if (~i) {
                    this.parent.group.children.splice(i, 1);
                }
            }
            this.parent = null;
        };
        array.domain = function() {
            var domain = [];
            this.screens.forEach(function(screen) {
                if (screen.attributes.domain) {
                    domain.push(screen.attributes.domain);
                }
            });
            if (this.parent && this.child_name) {
                var field = this.parent.model.fields[this.child_name];
                return [domain, field.get_domain(this.parent)];
            } else {
                return domain;
            }
        };
        array.clean4inversion = function(domain) {
            if (jQuery.isEmptyObject(domain)) {
                return [];
            }
            var inversion = new Sao.common.DomainInversion();
            var head = domain[0];
            var tail = domain.slice(1);
            if (~['AND', 'OR'].indexOf(head)) {
            } else if (inversion.is_leaf(head)) {
                var field = head[0];
                if ((field in this.model.fields) &&
                        (this.model.fields[field].description.readonly)) {
                    head = [];
                }
            } else {
                head = this.clean4inversion(head);
            }
            return [head].concat(this.clean4inversion(tail));
        };
        array.domain4inversion = function() {
            if (!this.__domain4inversion) {
                this.__domain4inversion = this.clean4inversion(this.domain());
            }
            return this.__domain4inversion;
        };
        return array;
    };

    Sao.Record = Sao.class_(Object, {
        id_counter: -1,
        init: function(model, id) {
            this.model = model;
            this.group = Sao.Group(model, {}, []);
            this.id = id || Sao.Record.prototype.id_counter--;
            this._values = {};
            this._changed = {};
            this._loaded = {};
            this.fields = {};
            this._timestamp = null;
            this.attachment_count = -1;
            this.state_attrs = {};
        },
        has_changed: function() {
            return !jQuery.isEmptyObject(this._changed);
        },
        save: function() {
            var context = this.get_context();
            var prm = jQuery.when();
            var values = this.get();
            if (this.id < 0) {
                prm = this.model.execute('create', [[values]], context);
                var created = function(ids) {
                    this.id = ids[0];
                };
                prm.done(created.bind(this));
            } else {
                if (!jQuery.isEmptyObject(values)) {
                    // TODO timestamp
                    prm = this.model.execute('write', [[this.id], values],
                            context);
                }
            }
            prm.done(function() {
                this.reload();
            }.bind(this));
            // TODO group written
            // TODO parent
            return prm;
        },
        reload: function(fields) {
            if (this.id < 0) {
                return jQuery.when();
            }
            return this.validate(fields);
        },
        load: function(name) {
            var self = this;
            var fname;
            var prm;
            if ((this.id < 0) || (name in this._loaded)) {
                return jQuery.when();
            }
            if (this.group.prm.state() == 'pending') {
                prm = jQuery.Deferred();
                this.group.prm.then(function() {
                    this.load(name).then(prm.resolve, prm.reject);
                }.bind(this));
                return prm;
            }
            var id2record = {};
            id2record[this.id] = this;
            var loading;
            if (name == '*') {
                loading = 'eager';
                for (fname in this.model.fields) {
                    if (!this.model.fields.hasOwnProperty(fname)) {
                        continue;
                    }
                    var field_loading = (
                            this.model.fields[fname].description.loading ||
                            'eager');
                    if (field_loading != 'eager') {
                        loading = 'lazy';
                        break;
                    }
                }
            } else {
                loading = (this.model.fields[name].description.loading ||
                        'eager');
            }
            var fnames = [];
            if (loading == 'eager') {
                for (fname in this.model.fields) {
                    if (!this.model.fields.hasOwnProperty(fname)) {
                        continue;
                    }
                    if ((this.model.fields[fname].description.loading ||
                                'eager') == 'eager') {
                        fnames.push(fname);
                    }
                }
            } else {
                fnames = Object.keys(this.model.fields);
            }
            fnames = fnames.filter(function(e, i, a) {
                return !(e in self._loaded);
            });
            var fnames_to_fetch = fnames.slice();
            var rec_named_fields = ['many2one', 'one2one', 'reference'];
            for (var i in fnames) {
                fname = fnames[i];
                var fdescription = this.model.fields[fname].description;
                if (~rec_named_fields.indexOf(fdescription.type))
                    fnames_to_fetch.push(fname + '.rec_name');
            }
            if (!~fnames.indexOf('rec_name')) {
                fnames_to_fetch.push('rec_name');
            }
            fnames_to_fetch.push('_timestamp');

            var context = jQuery.extend({}, this.get_context());
            if (loading == 'eager') {
                var limit = Sao.config.limit;
                if (!this.group.parent) {
                    // If not a children no need to load too much
                    limit = parseInt(limit / fnames_to_fetch.length, 10);
                }

                var filter_group = function(record) {
                    return !(name in record._loaded) && (record.id >= 0);
                };
                // TODO pool
                [[this.group, filter_group]].forEach(function(e) {
                    var group = e[0];
                    var filter = e[1];
                    var idx = this.group.indexOf(this);
                    if (~idx) {
                        var length = group.length;
                        var n = 1;
                        while (Object.keys(id2record).length &&
                            ((idx - n >= 0) || (idx + n < length)) &&
                            (n < 2 * limit)) {
                                var record;
                                if (idx - n >= 0) {
                                    record = group[idx - n];
                                    if (filter(record)) {
                                        id2record[record.id] = record;
                                    }
                                }
                                if (idx + n < length) {
                                    record = group[idx + n];
                                    if (filter(record)) {
                                        id2record[record.id] = record;
                                    }
                                }
                                n++;
                            }
                    }
                }.bind(this));
            }

            for (fname in this.model.fields) {
                if (!this.model.fields.hasOwnProperty(fname)) {
                    continue;
                }
                if ((this.model.fields[fname].description.type == 'binary') &&
                        ~fnames_to_fetch.indexOf(fname, fnames_to_fetch)) {
                    context[this.model.name + '.' + fname] = 'size';
                }
            }
            prm = this.model.execute('read', [Object.keys(id2record).map(
                        function (e) { return parseInt(e, 10); }),
                    fnames_to_fetch], context);
            var succeed = function(values) {
                var id2value = {};
                values.forEach(function(e, i, a) {
                    id2value[e.id] = e;
                });
                for (var id in id2record) {
                    if (!id2record.hasOwnProperty(id)) {
                        continue;
                    }
                    var record = id2record[id];
                    // TODO exception
                    var value = id2value[id];
                    if (record && value) {
                        for (var key in this._changed) {
                            if (!this._changed.hasOwnProperty(key)) {
                                continue;
                            }
                            delete value[key];
                        }
                        record.set(value);
                    }
                }
            }.bind(this);
            var failed = function() {
                var failed_values = [];
                var default_values;
                for (var id in id2record) {
                    default_values = {
                        id: id
                    };
                    for (var i in fnames_to_fetch) {
                        default_values[fnames_to_fetch[i]] = null;
                    }
                    failed_values.push(default_values);
                }
                succeed(failed_values);
            };
            this.group.prm = prm.then(succeed, failed);
            return this.group.prm;
        },
        set: function(values) {
            var rec_named_fields = ['many2one', 'one2one', 'reference'];
            for (var name in values) {
                if (!values.hasOwnProperty(name)) {
                    continue;
                }
                var value = values[name];
                if (name == '_timestamp') {
                    this._timestamp = value;
                    continue;
                }
                if (!(name in this.model.fields)) {
                    if (name == 'rec_name') {
                        this._values[name] = value;
                    }
                    continue;
                }
                // TODO delay O2M
                if ((this.model.fields[name] instanceof Sao.field.Many2One) ||
                        (this.model.fields[name] instanceof Sao.field.Reference)) {
                    var field_rec_name = name + '.rec_name';
                    if (values.hasOwnProperty(field_rec_name)) {
                        this._values[field_rec_name] = values[field_rec_name];
                    }
                    else if (this._values.hasOwnProperty(field_rec_name)) {
                        delete this._values[field_rec_name];
                    }
                }
                this.model.fields[name].set(this, value);
                this._loaded[name] = true;
            }
        },
        get: function() {
            var value = {};
            for (var name in this.model.fields) {
                if (!this.model.fields.hasOwnProperty(name)) {
                    continue;
                }
                var field = this.model.fields[name];
                if (field.description.readonly) {
                    continue;
                }
                if ((this._changed[name] === undefined) && this.id >= 0) {
                    continue;
                }
                value[name] = field.get(this);
            }
            return value;
        },
        get_context: function() {
            return this.group.context;
        },
        field_get: function(name) {
            return this.model.fields[name].get(this);
        },
        field_set: function(name, value) {
            this.model.fields[name].set(this, value);
        },
        field_get_client: function(name) {
            return this.model.fields[name].get_client(this);
        },
        field_set_client: function(name, value, force_change) {
            this.model.fields[name].set_client(this, value, force_change);
        },
        default_get: function() {
            var prm;
            if (!jQuery.isEmptyObject(this.model.fields)) {
                prm = this.model.execute('default_get',
                        [Object.keys(this.model.fields)], this.get_context());
                var force_parent = function(values) {
                    // TODO
                    return values;
                };
                prm = prm.pipe(force_parent).done(this.set_default.bind(this));
            } else {
                prm = jQuery.when();
            }
            // TODO autocomplete
            return prm;
        },
        set_default: function(values) {
            for (var fname in values) {
                if (!values.hasOwnProperty(fname)) {
                    continue;
                }
                var value = values[fname];
                if (!(fname in this.model.fields)) {
                    continue;
                }
                if ((this.model.fields[fname] instanceof Sao.field.Many2One) ||
                        (this.model.fields[fname] instanceof Sao.field.Reference)) {
                    var field_rec_name = fname + '.rec_name';
                    if (values.hasOwnProperty(field_rec_name)) {
                        this._values[field_rec_name] = values[field_rec_name];
                    } else if (this._values.hasOwnProperty(field_rec_name)) {
                        delete this._values[field_rec_name];
                    }
                }
                this.model.fields[fname].set_default(this, value);
                this._loaded[fname] = true;
            }
            this.validate(null, true).then(function() {
                this.group.root_group().screens.forEach(function(screen) {
                    screen.display();
                });
            }.bind(this));
        },
        get_eval: function() {
            var value = {};
            for (var key in this.model.fields) {
                if (!this.model.fields.hasOwnProperty(key) && this.id >= 0)
                    continue;
                value[key] = this.model.fields[key].get_eval(this);
            }
            return value;
        },
        get_on_change_value: function() {
            var value = {};
            for (var key in this.model.fields) {
                if (!this.model.fields.hasOwnProperty(key) && this.id >= 0)
                    continue;
                value[key] = this.model.fields[key].get_on_change_value(this);
            }
            return value;
        },
        _get_on_change_args: function(args) {
            var result = {};
            var values = Sao.common.EvalEnvironment(this, 'on_change');
            args.forEach(function(arg) {
                var scope = values;
                arg.split('.').forEach(function(e) {
                    if (scope !== undefined) {
                        scope = scope[e];
                    }
                });
                result[arg] = scope;
            });
            return result;
        },
        on_change: function(fieldname, attr) {
            if (typeof(attr) == 'string') {
                attr = new Sao.PYSON.Decoder().decode(attr);
            }
            var args = this._get_on_change_args(attr);
            var prm = this.model.execute('on_change_' + fieldname,
                   [args], this.get_context());
            return prm.then(this.set_on_change.bind(this));
        },
        on_change_with: function(field_name) {
            var fieldnames = {};
            var values = {};
            var later = {};
            var fieldname, on_change_with;
            for (fieldname in this.model.fields) {
                if (!this.model.fields.hasOwnProperty(fieldname)) {
                    continue;
                }
                on_change_with = this.model.fields[fieldname]
                    .description.on_change_with;
                if (jQuery.isEmptyObject(on_change_with)) {
                    continue;
                }
                if (!~on_change_with.indexOf(field_name)) {
                    continue;
                }
                if (field_name == fieldname) {
                    continue;
                }
                if (!jQuery.isEmptyObject(Sao.common.intersect(
                                Object.keys(fieldnames).sort(),
                                on_change_with.sort()))) {
                    later[fieldname] = true;
                    continue;
                }
                fieldnames[fieldname] = true;
                values = jQuery.extend(values,
                        this._get_on_change_args(on_change_with));
                if ((this.model.fields[fieldname] instanceof
                            Sao.field.Many2One) ||
                        (this.model.fields[fieldname] instanceof
                         Sao.field.Reference)) {
                    delete this._values[fieldname + '.rec_name'];
                }
            }
            var prms = [];
            var prm;
            if (!jQuery.isEmptyObject(fieldnames)) {
                prm = this.model.execute('on_change_with',
                        [values, Object.keys(fieldnames)], this.get_context());
                prms.push(prm.then(this.set_on_change.bind(this)));
            }
            var set_on_change = function(fieldname) {
                return function(result) {
                    this.model.fields[fieldname].set_on_change(this, result);
                };
            };
            for (fieldname in later) {
                if (!later.hasOwnProperty(fieldname)) {
                    continue;
                }
                on_change_with = this.model.fields[fieldname]
                    .description.on_change_with;
                values = this._get_on_change_args(on_change_with);
                prm = this.model.execute('on_change_with_' + fieldname,
                    [values], this.get_context());
                prms.push(prm.then(set_on_change(fieldname).bind(this)));
            }
            return jQuery.when.apply(jQuery, prms);
        },
        set_on_change: function(values) {
            var later = {};
            var fieldname, value;
            for (fieldname in values) {
                if (!values.hasOwnProperty(fieldname)) {
                    continue;
                }
                value = values[fieldname];
                if (!(fieldname in this.model.fields)) {
                    continue;
                }
                if (this.model.fields[fieldname] instanceof
                        Sao.field.One2Many) {
                    later[fieldname] = value;
                    continue;
                }
                if ((this.model.fields[fieldname] instanceof
                            Sao.field.Many2One) ||
                        (this.model.fields[fieldname] instanceof
                         Sao.field.Reference)) {
                    var field_rec_name = fieldname + '.rec_name';
                    if (values.hasOwnProperty(field_rec_name)) {
                        this._values[field_rec_name] = values[field_rec_name];
                    } else if (this._values.hasOwnProperty(field_rec_name)) {
                        delete this._values[field_rec_name];
                    }
                }
                this.model.fields[fieldname].set_on_change(this, value);
            }
            for (fieldname in later) {
                if (!later.hasOwnProperty(fieldname)) {
                    continue;
                }
                value = later[fieldname];
                var field_x2many = this.model.fields[fieldname];
                try {
                    field_x2many.in_on_change = true;
                    field_x2many.set_on_change(this, value);
                } finally {
                    field_x2many.in_on_change = false;
                }
            }
        },
        expr_eval: function(expr) {
            if (typeof(expr) != 'string') return expr;
            var ctx = jQuery.extend({}, this.get_context());
            ctx.context = jQuery.extend(this.model.session.context, ctx);
            jQuery.extend(ctx, this.get_eval());
            ctx.active_model = this.model.name;
            ctx.active_id = this.id;
            ctx._user = this.model.session.user_id;
            if (this.group.parent && this.group.parent_name) {
                var parent_env = Sao.common.EvalEnvironment(this.group.parent);
                ctx['_parent_' + this.group.parent_name] = parent_env;
            }
            return new Sao.PYSON.Decoder(ctx).decode(expr);
        },
        rec_name: function() {
            var prm = this.model.execute('read', [[this.id], ['rec_name']],
                    this.get_context());
            return prm.then(function(values) {
                return values[0].rec_name;
            });
        },
        validate: function(fields, softvalidation) {
            var prms = [];
            if (fields === undefined) {
                fields = null;
            }
            (fields || ['*']).forEach(function(field) {
                prms.push(this.load(field));
            }.bind(this));
            return jQuery.when.apply(jQuery, prms).then(function() {
                var result = true;
                var exclude_fields = [];
                this.group.screens.forEach(function(screen) {
                    if (screen.exclude_field) {
                        exclude_fields.push(screen.exclude_field);
                    }
                });
                for (var fname in this.model.fields) {
                    if (!this.model.fields.hasOwnProperty(fname)) {
                        continue;
                    }
                    var field = this.model.fields[fname];
                    if ((fields !== null) &&
                        (!~fields.indexOf(fname))) {
                        continue;
                    }
                    if (field.get_state_attrs(this).readonly) {
                        continue;
                    }
                    if (~exclude_fields.indexOf(fname)) {
                        continue;
                    }
                    if (!field.validate(this, softvalidation)) {
                        result = false;
                    }
                }
                return result;
            }.bind(this));
        },
        pre_validate: function() {
            // TODO
            return jQuery.when();
        },
        cancel: function() {
            this._loaded = {};
            this._changed = {};
        },
        get_loaded: function(fields) {
            if (!jQuery.isEmptyObject(fields)) {
                var result = true;
                fields.forEach(function(field) {
                    if (!(field in this._loaded) | !(field in this._changed)) {
                        result = false;
                    }
                }.bind(this));
                return result;
            }
            return Sao.common.compare(Object.keys(this.model.fields),
                    Object.keys(this._loaded));
        },
        deleted: function() {
            return Boolean(~this.group.record_deleted.indexOf(this));
        },
        removed: function() {
            return Boolean(~this.group.record_removed.indexOf(this));
        },
        get_attachment_count: function(reload) {
            var prm = jQuery.Deferred();
            if (this.id < 0) {
                prm.resolve(0);
                return prm;
            }
            if ((this.attachment_count < 0) || reload) {
                prm = Sao.rpc({
                    method: 'model.ir.attachment.search_count',
                    params: [
                    [['resource', '=', this.model.name + ',' + this.id]],
                    {}]
                }, this.model.session);
            } else {
                prm.resolve(this.attachment_count);
            }
            return prm;
        }
    });


    Sao.field = {};

    Sao.field.get = function(type) {
        switch (type) {
            case 'char':
                return Sao.field.Char;
            case 'selection':
                return Sao.field.Selection;
            case 'datetime':
                return Sao.field.DateTime;
            case 'date':
                return Sao.field.Date;
            case 'time':
                return Sao.field.Time;
            case 'float':
                return Sao.field.Float;
            case 'numeric':
                return Sao.field.Numeric;
            case 'integer':
                return Sao.field.Integer;
            case 'boolean':
                return Sao.field.Boolean;
            case 'many2one':
                return Sao.field.Many2One;
            case 'one2one':
                return Sao.field.One2One;
            case 'one2many':
                return Sao.field.One2Many;
            case 'many2many':
                return Sao.field.Many2Many;
            case 'reference':
                return Sao.field.Reference;
            case 'binary':
                return Sao.field.Binary;
            default:
                return Sao.field.Char;
        }
    };

    Sao.field.Field = Sao.class_(Object, {
        _default: null,
        init: function(description) {
            this.description = description;
            this.name = description.name;
        },
        set: function(record, value) {
            record._values[this.name] = value;
        },
        get: function(record) {
            return record._values[this.name] || this._default;
        },
        set_client: function(record, value, force_change) {
            var previous_value = this.get(record);
            this.set(record, value);
            if (previous_value != this.get(record)) {
                record._changed[this.name] = true;
                this.changed(record).done(function() {
                    // TODO parent
                    record.validate(null, true).then(function() {
                        record.group.changed().done(function() {
                            var root_group = record.group.root_group();
                            root_group.screens.forEach(function(screen) {
                                screen.display();
                            });
                        });
                    });
                });
            } else if (force_change) {
                record._changed[this.name] = true;
                this.changed(record).done(function() {
                    record.validate(null, true).then(function() {
                        var root_group = record.group.root_group();
                        root_group.screens.forEach(function(screen) {
                            screen.display();
                        });
                    });
                });
            }
        },
        get_client: function(record) {
            return this.get(record);
        },
        set_default: function(record, value) {
            record._values[this.name] = value;
            record._changed[this.name] = true;
        },
        set_on_change: function(record, value) {
            record._values[this.name] = value;
            record._changed[this.name] = true;
        },
        changed: function(record) {
            var prms = [];
            // TODO check readonly
            if (this.description.on_change) {
                prms.push(record.on_change(this.name,
                            this.description.on_change));
            }
            prms.push(record.on_change_with(this.name));
            // TODO autocomplete_with
            return jQuery.when.apply(jQuery, prms);
        },
        get_context: function(record) {
            var context = jQuery.extend({}, record.get_context());
            if (record.group.parent) {
                jQuery.extend(context, record.group.parent.get_context());
            }
            // TODO eval context attribute
            return context;
        },
        get_domains: function(record) {
            var inversion = new Sao.common.DomainInversion();
            var screen_domain = inversion.domain_inversion(
                    record.group.domain4inversion(), this.name,
                    Sao.common.EvalEnvironment(record));
            if ((typeof screen_domain == 'boolean') && !screen_domain) {
                screen_domain = [['id', '=', null]];
            } else if ((typeof screen_domain == 'boolean') && screen_domain) {
                screen_domain = [];
            }
            var attr_domain = record.expr_eval(this.description.domain || []);
            return [screen_domain, attr_domain];
        },
        get_domain: function(record) {
            var domains = this.get_domains(record);
            var screen_domain = domains[0];
            var attr_domain = domains[1];
            var inversion = new Sao.common.DomainInversion();
            return [inversion.localize_domain(screen_domain), attr_domain];
        },
        validation_domains: function(record) {
            var domains = this.get_domains(record);
            var screen_domain = domains[0];
            var attr_domain = domains[1];
            var inversion = new Sao.common.DomainInversion();
            if (!jQuery.isEmptyObject(attr_domain)) {
                return [screen_domain, [screen_domain,
                    inversion.unlocalize_domain(attr_domain, this.name)]];
            } else {
                return [screen_domain, screen_domain];
            }
        },
        get_eval: function(record) {
            return this.get(record);
        },
        get_on_change_value: function(record) {
            return this.get_eval(record);
        },
        set_state: function(record, states) {
            if (states === undefined) {
                states = ['readonly', 'required', 'invisible'];
            }
            var state_changes = record.expr_eval(
                    this.description.states || {});
            states.forEach(function(state) {
                if ((state == 'readonly') && this.description.readonly) {
                    return;
                }
                if (state_changes[state] !== undefined) {
                    this.get_state_attrs(record)[state] = state_changes[state];
                } else if (this.description[state] !== undefined) {
                    this.get_state_attrs(record)[state] =
                        this.description[state];
                }
            }.bind(this));
            // TODO group readonly
            // TODO domain readonly
        },
        get_state_attrs: function(record) {
            if (!(this.name in record.state_attrs)) {
                record.state_attrs[this.name] = jQuery.extend(
                        {}, this.description);
            }
            // TODO group readonly
            return record.state_attrs[this.name];
        },
        check_required: function(record) {
            var state_attrs = this.get_state_attrs(record);
            if (state_attrs.required == 1) {
                if (!this.get(record) && (state_attrs.readonly != 1)) {
                    return false;
                }
            }
            return true;
        },
        validate: function(record, softvalidation) {
            var result = true;
            if (this.description.readonly) {
                return true;
            }
            this.get_state_attrs(record).domain_readonly = false;
            var domains = this.validation_domains(record);
            var inverted_domain = domains[0];
            var domain = domains[1];
            if (!softvalidation) {
                result &= this.check_required(record);
            }
            if (typeof domain == 'boolean') {
                result &= domain;
            } else if (Sao.common.compare(domain, [['id', '=', null]])) {
                result = false;
            } else {
                var inversion = new Sao.common.DomainInversion();
                if ((inverted_domain instanceof Array) &&
                        (inverted_domain.length == 1) &&
                        (inverted_domain[0][1] == '=')) {
                    // If the inverted domain is so constraint that only one
                    // value is possible we should use it. But we must also pay
                    // attention to the fact that the original domain might be
                    // a 'OR' domain and thus not preventing the modification
                    // of fields.
                    var leftpart = inverted_domain[0][0];
                    var value = inverted_domain[0][2];
                    if (value === false) {
                        // XXX to remove once server domains are fixed
                        value = null;
                    }
                    var setdefault = true;
                    var original_domain = inversion.merge(
                            record.group.domain());
                    var domain_readonly = original_domain[0] == 'AND';
                    if (leftpart.contains('.')) {
                        var recordpart = leftpart.split('.', 1)[0];
                        var localpart = leftpart.split('.', 1)[1];
                        var constraintfields = [];
                        if (domain_readonly) {
                            inverted_domain.localize_domain(
                                    original_domain.slice(1))
                                .forEach(function(leaf) {
                                    constraintfields.push(leaf);
                                });
                        }
                        if ((localpart != 'id') ||
                                !~constraintfields.indexOf(recordpart)) {
                            setdefault = false;
                        }
                    }
                    if (setdefault) {
                        this.set_client(record, value);
                        this.get_state_attrs(record).domain_readonly =
                            domain_readonly;
                    }
                }
                result &= inversion.eval_domain(domain,
                        Sao.common.EvalEnvironment(record));
            }
            this.get_state_attrs(record).valid = result;
            return result;
        }
    });

    Sao.field.Char = Sao.class_(Sao.field.Field, {
        _default: ''
    });

    Sao.field.Selection = Sao.class_(Sao.field.Field, {
        _default: null,
        get_client: function(record) {
            return record._values[this.name];
        }
    });

    Sao.field.DateTime = Sao.class_(Sao.field.Field, {
        _default: null,
        time_format: function(record) {
            return record.expr_eval(this.description.format);
        },
        set_client: function(record, value, force_change) {
            if (!(value instanceof Date)) {
                try {
                    value = Sao.common.parse_datetime(
                        Sao.common.date_format(),
                        this.time_format(record),
                        value);
                } catch (e) {
                    value = this._default;
                }
            }
            Sao.field.DateTime._super.set_client.call(this, record, value,
                force_change);
        },
        get_client: function(record) {
            var value = Sao.field.Date._super.get_client.call(this, record);
            if (value) {
                return Sao.common.format_datetime(Sao.common.date_format(),
                        this.time_format(record), value);
            }
            return '';
        }
    });

    Sao.field.Date = Sao.class_(Sao.field.Field, {
        _default: null,
        set_client: function(record, value, force_change) {
            if (!(value instanceof Date)) {
                try {
                    value = Sao.Date(jQuery.datepicker.parseDate(
                            Sao.common.date_format(), value));
                } catch (e) {
                    value = this._default;
                }
            }
            Sao.field.Date._super.set_client.call(this, record, value,
                force_change);
        },
        get_client: function(record) {
            var value = Sao.field.Date._super.get_client.call(this, record);
            if (value) {
                return jQuery.datepicker.formatDate(Sao.common.date_format(),
                    value);
            }
            return '';
        }
    });

    Sao.field.Time = Sao.class_(Sao.field.Field, {
        _default: null,
        time_format: function(record) {
            return record.expr_eval(this.description.format);
        },
        set_client: function(record, value, force_change) {
            if (!(value instanceof Sao.Time)) {
                value = Sao.common.parse_time(this.time_format(record), value);
            }
            Sao.field.Time._super.set_client.call(this, record, value,
                force_change);
        },
        get_client: function(record) {
            var value = Sao.field.Time._super.get_client.call(this, record);
            if (value) {
                return Sao.common.format_time(this.time_format(record),
                    value);
            }
            return '';
        }
    });

    Sao.field.Number = Sao.class_(Sao.field.Field, {
        _default: null,
        get: function(record) {
            if (record._values[this.name] === undefined) {
                return this._default;
            } else {
                return record._values[this.name];
            }
        },
        digits: function(record) {
            var digits = [];
            var default_ = [16, 2];
            var record_digits = record.expr_eval(
                this.description.digits || default_);
            for (var idx in record_digits) {
                if (record_digits[idx] !== null) {
                    digits.push(record_digits[idx]);
                } else {
                    digits.push(default_[idx]);
                }
            }
            return digits;
        },
        check_required: function(record) {
            var state_attrs = this.get_state_attrs(record);
            if (state_attrs.required == 1) {
                if ((this.get(record) === null) &&
                    (state_attrs.readonly != 1)) {
                    return false;
                }
            }
            return true;
        }
    });

    Sao.field.Float = Sao.class_(Sao.field.Number, {
        set_client: function(record, value, force_change) {
            if (typeof value == 'string') {
                value = Number(value);
                if (isNaN(value)) {
                    value = this._default;
                }
            }
            Sao.field.Float._super.set_client.call(this, record, value,
                force_change);
        },
        get_client: function(record) {
            var value = record._values[this.name];
            if (value || value === 0) {
                var digits = this.digits(record);
                return value.toFixed(digits[1]);
            } else {
                return '';
            }
        }
    });

    Sao.field.Numeric = Sao.class_(Sao.field.Number, {
        set_client: function(record, value, force_change) {
            if (typeof value == 'string') {
                value = new Sao.Decimal(value);
                if (isNaN(value.valueOf())) {
                    value = this._default;
                }
            }
            Sao.field.Float._super.set_client.call(this, record, value,
                force_change);
        },
        get_client: function(record) {
            var value = record._values[this.name];
            if (value) {
                var digits = this.digits(record);
                return value.toFixed(digits[1]);
            } else {
                return '';
            }
        }
    });

    Sao.field.Integer = Sao.class_(Sao.field.Number, {
        set_client: function(record, value, force_change) {
            if (typeof value == 'string') {
                value = parseInt(value, 10);
                if (isNaN(value)) {
                    value = this._default;
                }
            }
            Sao.field.Integer._super.set_client.call(this, record, value,
                force_change);
        },
        get_client: function(record) {
            var value = record._values[this.name];
            if (value || value === 0) {
                return '' + value;
            } else {
                return '';
            }
        },
        digits: function(record) {
            return [16, 0];
        }
    });

    Sao.field.Boolean = Sao.class_(Sao.field.Field, {
        _default: false,
        set_client: function(record, value, force_change) {
            value = Boolean(value);
            Sao.field.Boolean._super.set_client.call(this, record, value,
                force_change);
        },
        get: function(record) {
            return Boolean(record._values[this.name]);
        },
        get_client: function(record) {
            return Boolean(record._values[this.name]);
        }
    });

    Sao.field.Many2One = Sao.class_(Sao.field.Field, {
        _default: null,
        get: function(record) {
            var value = record._values[this.name];
            if (value === undefined) {
                value = this._default;
            }
            // TODO force parent
            return value;
        },
        get_client: function(record) {
            var rec_name = record._values[this.name + '.rec_name'];
            if (rec_name === undefined) {
                this.set(record, this.get(record));
                rec_name = record._values[this.name + '.rec_name'] || '';
            }
            return rec_name;
        },
        set: function(record, value) {
            var rec_name = record._values[this.name + '.rec_name'] || '';
            // TODO force parent
            var store_rec_name = function(rec_name) {
                record._values[this.name + '.rec_name'] = rec_name[0].rec_name;
            };
            if (!rec_name && (value >= 0) && (value !== null)) {
                var model_name = record.model.fields[this.name].description
                    .relation;
                Sao.rpc({
                    'method': 'model.' + model_name + '.read',
                    'params': [[value], ['rec_name'], record.get_context()]
                }, record.model.session).done(store_rec_name.bind(this));
            } else {
                store_rec_name.call(this, [{'rec_name': rec_name}]);
            }
            record._values[this.name] = value;
            // TODO force parent
        },
        set_client: function(record, value, force_change) {
            var rec_name;
            if (value instanceof Array) {
                rec_name = value[1];
                value = value[0];
            } else {
                if (value == this.get(record)) {
                    rec_name = record._values[this.name + '.rec_name'] || '';
                } else {
                    rec_name = '';
                }
            }
            record._values[this.name + '.rec_name'] = rec_name;
            Sao.field.Many2One._super.set_client.call(this, record, value,
                    force_change);
        },
        validation_domains: function(record) {
            var screen_domain = this.get_domains(record)[0];
            return [screen_domain, screen_domain];
        },
        get_domain: function(record) {
            var domains = this.get_domains(record);
            var screen_domain = domains[0];
            var attr_domain = domains[1];
            var inversion = new Sao.common.DomainInversion();
            return [inversion.localize_domain(
                    inversion.inverse_leaf(screen_domain), this.name),
                   attr_domain];
        }
    });

    Sao.field.One2One = Sao.class_(Sao.field.Many2One, {
    });

    Sao.field.One2Many = Sao.class_(Sao.field.Field, {
        init: function(description) {
            Sao.field.One2Many._super.init.call(this, description);
            this.in_on_change = false;
            this.context = {};
        },
        _default: null,
        _set_value: function(record, value, default_) {
            var mode;
            if ((value instanceof Array) && !isNaN(parseInt(value[0], 10))) {
                mode = 'list ids';
            } else {
                mode = 'list values';
            }
            var group = record._values[this.name];
            var model;
            if (group !== undefined) {
                model = group.model;
                group.destroy();
                // TODO unconnect
            } else if (record.model.name == this.description.relation) {
                model = record.model;
            } else {
                model = new Sao.Model(this.description.relation);
            }
            var prm = jQuery.when();
            if ((mode == 'list values') && !jQuery.isEmptyObject(value)) {
                var context = this.get_context(record);
                var field_names = {};
                for (var val in value) {
                    if (!value.hasOwnProperty(val)) {
                        continue;
                    }
                    for (var fieldname in val) {
                        if (!val.hasOwnProperty(fieldname)) {
                            continue;
                        }
                        field_names[fieldname] = true;
                    }
                }
                if (!jQuery.isEmptyObject(field_names)) {
                    var args = {
                        'method': 'model.' + this.description.relation +
                            '.fields_get',
                        'params': [Object.keys(field_names), context]
                    };
                    prm = Sao.rpc(args, record.model.session);
                }
            }
            var set_value = function(fields) {
                var group = Sao.Group(model, this.context, []);
                group.set_parent(record);
                group.parent_name = this.description.relation_field;
                group.child_name = this.name;
                if (!jQuery.isEmptyObject(fields)) {
                    group.model.add_fields(fields);
                }
                if (record._values[this.name] !== undefined) {
                    for (var i = 0, len = record._values[this.name].length;
                            i < len; i++) {
                        var r = record._values[this.name][i];
                        if (r.id >= 0) {
                            group.record_deleted.push(r);
                        }
                    }
                    jQuery.extend(group.record_deleted,
                            record._values[this.name].record_deleted);
                    jQuery.extend(group.record_removed,
                            record._values[this.name].record_removed);
                }
                record._values[this.name] = group;
                if (mode == 'list ids') {
                    group.load(value);
                } else {
                    for (var vals in value) {
                        if (!value.hasOwnProperty(vals)) {
                            continue;
                        }
                        var new_record = group.new_(false);
                        if (default_) {
                            new_record.set_default(vals);
                            group.add(new_record);
                        } else {
                            new_record.id *= 1;
                            new_record.set(vals);
                            group.push(new_record);
                        }
                    }
                }
            };
            return prm.pipe(set_value.bind(this));
        },
        set: function(record, value) {
            return this._set_value(record, value, false);
        },
        get: function(record) {
            var group = record._values[this.name];
            if (group === undefined) {
                return [];
            }
            var record_removed = group.record_removed;
            var record_deleted = group.record_deleted;
            var result = [['add', []]];
            var parent_name = this.description.relation_field || '';
            for (var i = 0, len = group.length; i < len; i++) {
                var record2 = group[i];
                if (~record_removed.indexOf(record2) ||
                        ~record_deleted.indexOf(record2)) {
                    continue;
                }
                var values;
                if (record2.id >= 0) {
                    values = record2.get();
                    delete values[parent_name];
                    if (record2.has_changed() &&
                            !jQuery.isEmptyObject(values)) {
                        result.push(['write', [record2.id], values]);
                    }
                    result[0][1].push(record2.id);
                } else {
                    values = record2.get();
                    delete values[parent_name];
                    result.push(['create', values]);
                }
            }
            if (jQuery.isEmptyObject(result[0][1])) {
                result.shift();
            }
            if (!jQuery.isEmptyObject(record_removed)) {
                result.push(['unlink', record_removed.map(function(r) {
                    return r.id;
                })]);
            }
            if (!jQuery.isEmptyObject(record_deleted)) {
                result.push(['delete', record_deleted.map(function(r) {
                    return r.id;
                })]);
            }
            return result;
        },
        set_client: function(record, value, force_change) {
        },
        get_client: function(record) {
            this._set_default_value(record);
            return record._values[this.name];
        },
        set_default: function(record, value) {
            var previous_group = record._values[this.name];
            var prm = this._set_value(record, value, true);
            prm.done(function() {
                var group = record._values[this.name];
                if (previous_group) {
                    previous_group.forEach(function(r) {
                        if (r.id >= 0) {
                            group.record_deleted.push(r);
                        }
                    });
                    group.record_deleted = group.record_deleted.concat(
                        previous_group.record_deleted);
                    group.record_removed = group.record_removed.concat(
                        previous_group.record_removed);
                }
            }.bind(this));
            record._changed[this.name] = true;
        },
        set_on_change: function(record, value) {
            this._set_default_value(record);
            if (value instanceof Array) {
                this._set_value(record, value);
                record._changed[this.name] = true;
                record.group.changed();
                return;
            }
            var prm = jQuery.when();
            if (value.add || value.update) {
                var context = this.get_context(record);
                var fields = record._values[this.name].model.fields;
                var field_names = {};
                [value.add, value.update].forEach(function(l) {
                    if (!jQuery.isEmptyObject(l)) {
                        l.forEach(function(v) {
                            Object.keys(v).forEach(function(f) {
                                if (!(f in fields) &&
                                    (f != 'id')) {
                                        field_names[f] = true;
                                    }
                            });
                        });
                    }
                });
                if (!jQuery.isEmptyObject(field_names)) {
                    var args = {
                        'method': 'model.' + this.description.relation +
                            '.fields_get',
                        'params': [Object.keys(field_names), context]
                    };
                    prm = Sao.rpc(args, record.model.session);
                } else {
                    prm.resolve({});
                }
            }

            var to_remove = [];
            var group = record._values[this.name];
            group.forEach(function(record2) {
                if (!record2.id) {
                    to_remove.push(record2);
                }
            });
            if (value.remove) {
                value.remove.forEach(function(record_id) {
                    var record2 = group.get(record_id);
                    if (record2) {
                        to_remove.push(record2);
                    }
                }.bind(this));
            }
            to_remove.forEach(function(record2) {
                group.remove(record2, false, true, false);
            }.bind(this));

            if (value.add || value.update) {
                prm.then(function(fields) {
                    group.model.add_fields(fields);
                    if (value.add) {
                        value.add.forEach(function(vals) {
                            var new_record = group.new_(false);
                            group.add(new_record);
                            new_record.set_on_change(vals);
                        });
                    }
                    if (value.update) {
                        value.update.forEach(function(vals) {
                            if (!vals.id) {
                                return;
                            }
                            var record2 = group.get(vals.id);
                            if (record2) {
                                record2.set_on_change(vals);
                            }
                        });
                    }
                }.bind(this));
            }
        },
        _set_default_value: function(record) {
            if (record._values[this.name] !== undefined) {
                return;
            }
            var group = Sao.Group(new Sao.Model(this.description.relation),
                    this.context, []);
            group.set_parent(record);
            group.parent_name = this.description.relation_field;
            group.child_name = this.name;
            if (record.model.name == this.description.relation) {
                group.fields = record.model.fields;
            }
            record._values[this.name] = group;
        },
        get_eval: function(record) {
            var result = [];
            var group = record._values[this.name];
            if (group === undefined) return result;

            var record_removed = group.record_removed;
            var record_deleted = group.record_deleted;
            for (var i = 0, len = record._values[this.name].length; i < len;
                    i++) {
                var record2 = group[i];
                if (~record_removed.indexOf(record2) ||
                        ~record_deleted.indexOf(record2))
                    continue;
                result.push(record2.id);
            }
            return result;
        },
        get_on_change_value: function(record) {
            var result = [];
            var group = record._values[this.name];
            if (group === undefined) return result;
            for (var i = 0, len = record._values[this.name].length; i < len;
                    i++) {
                var record2 = group[i];
                if (!record2.deleted() || !record2.removed())
                    result.push(record2.get_on_change_value());
            }
            return result;
        },
        changed: function(record) {
            if (!this.in_on_change) {
                return Sao.field.One2Many._super.changed.call(this, record);
            }
        },
        get_domain: function(record) {
            var domains = this.get_domains(record);
            var screen_domain = domains[0];
            var attr_domain = domains[1];
            var inversion = new Sao.common.DomainInversion();
            return [inversion.localize_domain(
                    inversion.inverse_leaf(screen_domain)),
                   attr_domain];
        },
        validation_domains: function(record) {
            var screen_domain = this.get_domains(record)[0];
            return [screen_domain, screen_domain];
        },
        set_state: function(record, states) {
            this._set_default_value(record);
            Sao.field.One2Many._super.set_state.call(this, record, states);
            record._values[this.name].readonly = this.get_state_attrs(record)
                .readonly;
        }
    });

    Sao.field.Many2Many = Sao.class_(Sao.field.One2Many, {
        set: function(record, value) {
            var group = record._values[this.name];
            var model;
            if (group !== undefined) {
                model = group.model;
                group.destroy();
                // TODO unconnect
            } else if (record.model.name == this.description.relation) {
                model = record.model;
            } else {
                model = new Sao.Model(this.description.relation);
            }
            group = Sao.Group(model, this.context, []);
            group.set_parent(record);
            group.parent_name = this.description.relation_field;
            group.child_name = this.name;
            if (record._values[this.name] !== undefined) {
                jQuery.extend(group.record_removed, record._values[this.name]);
                jQuery.extend(group.record_deleted,
                    record._values[this.name].record_deleted);
                jQuery.extend(group.record_removed,
                    record._values[this.name].record_removed);
            }
            record._values[this.name] = group;
            group.load(value);
        },
        get_on_change_value: function(record) {
            return this.get_eval(record);
        }
    });

    Sao.field.Reference = Sao.class_(Sao.field.Field, {
        _default: null,
        get_client: function(record) {
            if (record._values[this.name]) {
                var model = record._values[this.name][0];
                var name = record._values[this.name + '.rec_name'] || '';
                return [model, name];
            } else {
                return null;
            }
        },
        get: function(record) {
            if (record._values[this.name] &&
                record._values[this.name][0] &&
                record._values[this.name][1] >= -1) {
                return record._values[this.name].join(',');
            }
        },
        set_client: function(record, value, force_change) {
            if (value) {
                if (typeof(value) == 'string') {
                    value = value.split(',');
                }
                var ref_model = value[0];
                var ref_id = value[1];
                var rec_name;
                if (ref_id instanceof Array) {
                    rec_name = ref_id[1];
                    ref_id = ref_id[0];
                } else {
                    if (ref_id && !isNaN(parseInt(ref_id, 10))) {
                        ref_id = parseInt(ref_id, 10);
                    }
                    if ([ref_model, ref_id].join(',') == this.get(record)) {
                        rec_name = record._values[this.name + '.rec_name'] || '';
                    } else {
                        rec_name = '';
                    }
                }
                record._values[this.name + '.rec_name'] = rec_name;
                value = [ref_model, ref_id];
            }
            Sao.field.Reference._super.set_client.call(
                    this, record, value, force_change);
        },
        set: function(record, value) {
            if (!value) {
                record._values[this.name] = this._default;
                return;
            }
            var ref_model, ref_id;
            if (typeof(value) == 'string') {
                ref_model = value.split(',')[0];
                ref_id = value.split(',')[1];
                if (!ref_id) {
                    ref_id = null;
                } else if (!isNaN(parseInt(ref_id, 10))) {
                    ref_id = parseInt(ref_id, 10);
                }
            } else {
                ref_model = value[0];
                ref_id = value[1];
            }
            var rec_name = record._values[this.name + '.rec_name'] || '';
            var store_rec_name = function(rec_name) {
                record._values[this.name + '.rec_name'] = rec_name;
            }.bind(this);
            if (ref_model && ref_id >= 0) {
                if (!rec_name && ref_id >= 0) {
                    Sao.rpc({
                        'method': 'model.' + ref_model + '.read',
                        'params': [[ref_id], ['rec_name'], record.get_context()]
                    }, record.model.session).done(function(result) {
                        store_rec_name(result[0].rec_name);
                    });
                }
            } else if (ref_model) {
                rec_name = '';
            } else {
                rec_name = ref_id;
            }
            record._values[this.name] = [ref_model, ref_id];
            store_rec_name(rec_name);
        }
    });

    Sao.field.Binary = Sao.class_(Sao.field.Field, {
        _default: null,
        get_size: function(record) {
            var data = record._values[this.name] || 0;
            if (data instanceof Uint8Array) {
                return data.length;
            }
            return data;
        },
        get_data: function(record) {
            var prm = jQuery.when();
            var data = record._values[this.name] || 0;
            if (!(data instanceof Uint8Array)) {
                if (record.id < 0) {
                    return prm;
                }
                var context = record.get_context();
                prm = record.model.execute('read', [[record.id], [this.name]],
                    context);
                prm.done(function(data) {
                    return data[0][this.name];
                }.bind(this));
                return prm;
            }
        }
    });
}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.Tab = Sao.class_(Object, {
        init: function() {
            this.buttons = {};
        },
        create_tabcontent: function() {
            this.el = jQuery('<div/>', {
                'class': this.class_
            });

            var title = this.make_title_bar();
            this.el.append(title);

            var toolbar = this.create_toolbar();
            this.el.append(toolbar);
        },
        make_title_bar: function() {
            var title = jQuery('<div/>', {
                'class': 'tab-title-bar ui-widget-header ui-corner-all'
            });

            var menu = this.set_menu();
            title.append(menu);
            title.append(jQuery('<button/>', {
                'class': 'tab-title'
            }).button({
                label: this.name,
                text: true,
                icons: {
                    primary: 'ui-icon-triangle-1-s'
                }
            }).click(function() {
                menu.toggle().position({
                    my: 'left top',
                    at: 'left bottom',
                    of: jQuery(this)
                });
                // Bind hide after the processing of the current click
                window.setTimeout(function() {
                    jQuery(document).one('click', function() {
                        menu.hide();
                    });
                }, 0);
            }));

            this.status = jQuery('<span/>', {
                'class': 'tab-status'
            });
            title.append(this.status);

            this.info = jQuery('<span/>', {
                'class': 'tab-info'
            });
            title.append(this.info);
            return title;
        },
        set_menu: function() {
            var menu = jQuery('<ul/>');
            this.menu_def.forEach(function(definition) {
                var icon = definition[0];
                var name = definition[1];
                var func = definition[2];
                var item = jQuery('<li/>').append(
                    jQuery('<a/>').append(jQuery('<span/>', {
                        'class': 'ui-icon ' + icon
                    })).append(name));
                menu.append(item);
                item.click(function() {
                    this[func]();
                }.bind(this));
            }.bind(this));
            menu.menu({}).hide().css({
                position: 'absolute',
                'z-index': 100
            });
            return menu;
        },
        create_toolbar: function() {
            var toolbar = jQuery('<div/>', {
                'class': 'ui-widget-header ui-corner-all'
            });
            var add_button = function(tool) {
                var click_func = function() {
                    this[tool[4]]();
                };
                var button = jQuery('<button/>').button({
                    id: tool[0],
                    text: tool[2],
                    icons: {
                        primary: tool[1]
                    },
                    label: tool[2]
                })
                .click(click_func.bind(this));
                toolbar.append(button);
                // TODO tooltip
                this.buttons[tool[0]] = button;
            };
            this.toolbar_def.forEach(add_button.bind(this));
            return toolbar;
        },
        close: function() {
            var tabs = jQuery('#tabs > div');
            if (this.modified_save()) {
                tabs.tabs('remove', this.id);
                if (!tabs.find('> ul').children().length) {
                    tabs.remove();
                }
            }
        }
    });

    Sao.Tab.counter = 0;

    Sao.Tab.create = function(attributes) {
        if (attributes.context === undefined) {
            attributes.context = {};
        }
        var tab;
        if (attributes.model) {
            tab = new Sao.Tab.Form(attributes.model, attributes);
        } else {
            tab = new Sao.Tab.Board(attributes);
        }
        if (!jQuery('#tabs').children().length) {
            jQuery('#tabs').append(jQuery('<div/>').append(jQuery('<ul/>')));
        }
        var tabs = jQuery('#tabs > div');
        tabs.tabs();
        tab.id = '#tab-' + Sao.Tab.counter++;
        tabs.tabs('add', tab.id, tab.name);
        tabs.find('> ul li').last().append(jQuery('<a href="#">' +
                    '<span class="ui-icon ui-icon-circle-close"></span>' +
                    '</a>')
                .hover(
                    function() {
                        jQuery(this).css('cursor', 'pointer');
                    },
                    function() {
                        jQuery(this).css('cursor', 'default');
                    })
                .click(function() {
                    tab.close();
                }));
        jQuery(tab.id).html(tab.el);
        tabs.tabs('select', tab.id);
        jQuery(window).resize();
    };

    Sao.Tab.Form = Sao.class_(Sao.Tab, {
        class_: 'tab-form',
        init: function(model_name, attributes) {
            Sao.Tab.Form._super.init.call(this);
            var screen = new Sao.Screen(model_name, attributes);
            screen.tab = this;
            this.screen = screen;
            this.attributes = jQuery.extend({}, attributes);
            this.name = attributes.name; // XXX use screen current view title

            this.create_tabcontent();

            var access = Sao.common.MODELACCESS.get(model_name);
            [['new', 'create'], ['save', 'write']].forEach(function(e) {
                var button = e[0];
                var access_type = e[1];
                this.buttons[button].prop('disabled', !access[access_type]);
            }.bind(this));

            this.view_prm = this.screen.switch_view().done(function() {
                this.el.append(screen.screen_container.el);
                screen.search_filter();
            }.bind(this));
        },
        // TODO translate labels
        toolbar_def: [
            ['new', 'ui-icon-document', 'New', 'Create a new record', 'new_'],
            ['save', 'ui-icon-disk', 'Save', 'Save this record', 'save'],
            ['switch', 'ui-icon-arrow-4-diag', 'Switch', 'Switch view',
            'switch_'],
            ['reload', 'ui-icon-refresh', 'Reload', 'Reload', 'reload'],
            ['previous', 'ui-icon-arrowthick-1-w', 'Previous',
            'Previous Record', 'previous'],
            ['next', 'ui-icon-arrowthick-1-e', 'Next', 'Next Record', 'next'],
            ['attach', 'ui-icon-pin-w', 'Attachment',
            'Add an attachment to the record', 'attach']
            ],
        menu_def: [
            ['ui-icon-document', 'New', 'new_'],
            ['ui-icon-disk', 'Save', 'save'],
            ['ui-icon-arrow-4-diag', 'Switch', 'switch_'],
            ['ui-icon-refresh', 'Reload/Undo', 'reload'],
            ['ui-icon-copy', 'Duplicate', 'copy'],
            ['ui-icon-trash', 'Delete', 'delete_'],
            ['ui-icon-arrowthick-1-w', 'Previous', 'previous'],
            ['ui-icon-arrowthick-1-e', 'Next', 'next'],
            ['ui-icon-search', 'Search', 'search'],
            ['ui-icon-clock', 'View Logs', 'logs'],
            ['ui-icon-circle-close', 'Close Tab', 'close'],
            ['ui-icon-pin-w', 'Attachment', 'attach'],
            ['ui-icon-gear', 'Action', 'action'],
            ['ui-icon-arrowreturn-1-e', 'Relate', 'relate'],
            ['ui-icon-print', 'Print', 'print']
            ],
        create_toolbar: function() {
            var toolbar = Sao.Tab.Form._super.create_toolbar.call(this);
            var screen = this.screen;
            var buttons = this.buttons;
            var prm = screen.model.execute('view_toolbar_get', [],
                    screen.context);
            prm.done(function(toolbars) {
                // TODO translation
                [
                ['action', 'ui-icon-gear', 'Action', 'Launch action'],
                ['relate', 'ui-icon-arrowreturn-1-e', 'Relate',
                'Open related records'],
                ['print', 'ui-icon-print', 'Print', 'Print report']
                ].forEach(function(menu_action) {
                    var button = jQuery('<button/>').button({
                        id: menu_action[0],
                        text: true,
                        icons: {
                            primary: menu_action[1],
                            secondary: 'ui-icon-triangle-1-s'
                        },
                        label: menu_action[2]
                    });
                    buttons[menu_action[0]] = button;
                    toolbar.append(button);
                    var menu = jQuery('<ul/>');
                    button.click(function() {
                        menu.toggle().position({
                            my: 'left top',
                            at: 'left bottom',
                            of: button
                        });
                        // Bind hide after the processing of the current click
                        window.setTimeout(function() {
                            jQuery(document).one('click', function() {
                                menu.hide();
                            });
                        }, 0);
                    });

                    toolbars[menu_action[0]].forEach(function(action) {
                        var item = jQuery('<li/>').append(
                            jQuery('<a/>').append(action.name));
                        menu.append(item);
                        item.click(function() {
                            var exec_action = jQuery.extend({}, action);
                            // TODO test save
                            exec_action = Sao.Action.evaluate(exec_action,
                                menu_action[0], screen.current_record);
                            var data = {
                                model: screen.model_name,
                                id: screen.get_id(),
                                ids: [screen.get_id()] // TODO ids selected
                            };
                            Sao.Action.exec_action(exec_action, data,
                                screen.context);
                        });
                    });
                    menu.menu({}).hide().css({
                        position: 'absolute',
                        'z-index': 100
                    });
                    toolbar.append(menu);
                });
            });
            return toolbar;
        },
        modified_save: function() {
            this.screen.save_tree_state();
            this.screen.current_view.set_value();
            if (this.screen.modified()) {
                // TODO popup
                return false;
            }
            return true;
        },
        new_: function() {
            if (!Sao.common.MODELACCESS.get(this.screen.model_name).create) {
                return;
            }
            if (!this.modified_save()) {
                return;
            }
            this.screen.new_();
            // TODO message
            // TODO activate_save
        },
        save: function() {
            if (!Sao.common.MODELACCESS.get(this.screen.model_name).write) {
                return;
            }
            if (this.screen.save_current()) {
                // TODO message
                return true;
            } else {
                // TODO message
                return false;
            }
        },
        switch_: function() {
            // TODO modified
            this.screen.switch_view();
        },
        reload: function(test_modified) {
            if (test_modified && this.screen.modified()) {
                // TODO popup
            }
            this.screen.cancel_current().done(function() {
                this.screen.save_tree_state(false);
                if (this.screen.current_view.view_type != 'form') {
                    this.screen.search_filter();  // TODO set search text
                    // TODO set current_record
                }
                this.screen.display();
                // TODO message
                // TODO activate_save
            }.bind(this));
        },
        copy: function() {
            if (!Sao.common.MODELACCESS.get(this.screen.model_name).create) {
                return;
            }
            if (!this.modified_save()) {
                return;
            }
            this.screen.copy();
            // TODO message
        },
        delete_: function() {
            if (!Sao.common.MODELACCESS.get(this.screen.model_name)['delete']) {
                return;
            }
            // TODO popup
            this.screen.remove(true, false, true).done(function() {
                // TODO message
            });
        },
        previous: function() {
            if (!this.modified_save()) {
                return;
            }
            this.screen.display_previous();
            // TODO message and activate_save
        },
        next: function() {
            if (!this.modified_save()) {
                return;
            }
            this.screen.display_next();
            // TODO message and activate_save
        },
        search: function() {
            var search_entry = this.screen.screen_container.search_entry;
            if (search_entry.is(':visible')) {
                window.setTimeout(function() {
                    search_entry.focus();
                }, 0);
            }
        },
        logs: function() {
            var record = this.screen.current_record;
            if ((!record) || (record.id < 0)) {
                // TODO message
                return;
            }
            // TODO translation
            var fields = [
                ['id', 'ID:'],
                ['create_uid.rec_name', 'Creation User:'],
                ['create_date', 'Creation Date:'],
                ['write_uid.rec_name', 'Latest Modification by:'],
                ['write_date', 'Latest Modification Date:']
                ];

            this.screen.model.execute('read', [[record.id],
                    fields.map(function(field) {
                        return field[0];
                    })], this.screen.context)
            .then(function(result) {
                result = result[0];
                var message = '';
                fields.forEach(function(field) {
                    var key = field[0];
                    var label = field[1];
                    var value = result[key] || '/';
                    if (result[key] &&
                        ~['create_date', 'write_date'].indexOf(key)) {
                        value = Sao.common.format_datetime(
                            Sao.common.date_format(),
                            '%H:%M:%S',
                            value);
                    }
                    message += label + ' ' + value + '\n';
                });
                message += 'Model: ' + this.screen.model.name;
                Sao.common.message.run(message);
            }.bind(this));
        },
        attach: function() {
            var record = this.screen.current_record;
            if (!record || (record.id < 0)) {
                return;
            }
            new Sao.Window.Attachment(record, function() {
                this.update_attachment_count(true);
            }.bind(this));
        },
        update_attachment_count: function(reload) {
            var record = this.screen.current_record;
            if (record) {
                record.get_attachment_count(reload).always(
                        this.attachment_count.bind(this));
            } else {
                this.attachment_count(0);
            }
        },
        attachment_count: function(count) {
            var label = 'Attachment(' + count + ')';  // TODO translate
            this.buttons.attach.button('option', 'label', label);
            if (count) {
                this.buttons.attach.button('option', 'icons', {
                    primary: 'ui-icon-pin-s'
                });
            } else {
                this.buttons.attach.button('option', 'icons', {
                    primary: 'ui-icon-pin-w'
                });
            }
            var record_id = this.screen.get_id();
            this.buttons.attach.prop('disabled',
                record_id < 0 || record_id === null);
        },
        action: function() {
            this.buttons.action.click();
        },
        relate: function() {
            this.buttons.relate.click();
        },
        print: function() {
            this.buttons.print.click();
        }
    });
}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.ScreenContainer = Sao.class_(Object, {
        init: function(tab_domain) {
            this.alternate_viewport = jQuery('<div/>', {
                'class': 'screen-container'
            });
            this.alternate_view = false;
            this.tab_domain = tab_domain || [];
            this.el = jQuery('<div/>', {
                'class': 'screen-container'
            });
            this.filter_box = jQuery('<table/>', {
                'class': 'filter-box'
            });
            var tr = jQuery('<tr/>');
            this.filter_box.append(tr);
            this.el.append(this.filter_box);
            this.filter_button = jQuery('<button/>').button({
                'disabled': true,
                'label': 'Filters' // TODO translation
            });
            tr.append(jQuery('<td/>').append(this.filter_button));
            this.search_entry = jQuery('<input/>');
            this.search_entry.keypress(function(e) {
                if (e.which == 13) {
                    this.do_search();
                    return false;
                }
            }.bind(this));
            tr.append(jQuery('<td/>').append(this.search_entry));
            this.but_bookmark = jQuery('<button/>').button({
                'disabled': true,
                'label': 'Bookmark' // TODO translation
            });
            tr.append(jQuery('<td/>').append(this.but_bookmark));
            this.but_prev = jQuery('<button/>').button({
                'label': 'Previous'
            });
            this.but_prev.click(this.search_prev.bind(this));
            tr.append(jQuery('<td/>').append(this.but_prev));
            this.but_next = jQuery('<button/>').button({
                'label': 'Next'
            });
            this.but_next.click(this.search_next.bind(this));
            tr.append(jQuery('<td/>').append(this.but_next));

            this.content_box = jQuery('<div/>', {
                'class': 'content-box'
            });

            if (!jQuery.isEmptyObject(this.tab_domain)) {
                this.tab = jQuery('<div/>', {
                    'class': 'tab-domain'
                }).append(jQuery('<div/>').append(jQuery('<ul/>')));
                this.tab.tabs();
                this.tab_domain.forEach(function(tab_domain, i) {
                    var name = tab_domain[0];
                    this.tab.tabs('add', '#' + i, name);
                }.bind(this));
                this.tab.find('#0').append(this.content_box);
                this.tab.tabs('select', '#0');
                this.tab.tabs({
                    'activate': this.switch_page.bind(this)
                });
                this.el.append(this.tab);
            } else {
                this.tab = null;
                this.el.append(this.content_box);
            }
        },
        set_text: function(value) {
            this.search_entry.val(value);
        },
        search_prev: function() {
            this.screen.search_prev(this.search_entry.val());
        },
        search_next: function() {
            this.screen.search_next(this.search_entry.val());
        },
        switch_page: function(event, ui) {
            ui.newPanel.append(ui.oldPanel.children().detach());
            this.do_search();
        },
        get_tab_domain: function() {
            if (!this.tab) {
                return [];
            }
            return this.tab_domain[this.tab.tabs('option', 'active')][1];
        },
        do_search: function() {
            this.screen.search_filter(this.search_entry.val());
        },
        set_screen: function(screen) {
            this.screen = screen;
        },
        show_filter: function() {
            this.filter_box.show();
            if (this.tab) {
                this.tab.show();
                this.content_box.detach();
                this.tab.find('#' + this.tab.tabs('option', 'active'))
                    .append(this.content_box);
            }
        },
        hide_filter: function() {
            this.filter_box.hide();
            if (this.tab) {
                this.tab.hide();
                this.content_box.detach();
                this.el.append(this.content_box);
            }
        },
        set: function(widget) {
            if (this.alternate_view) {
                this.alternate_viewport.children().detach();
                // TODO test if widget is content_box widget
                this.alternate_viewport.append(widget);
            } else {
                this.content_box.children().detach();
                this.content_box.append(widget);
            }
        }
    });

    Sao.Screen = Sao.class_(Object, {
        init: function(model_name, attributes) {
            this.model_name = model_name;
            this.model = new Sao.Model(model_name, attributes);
            this.attributes = jQuery.extend({}, attributes);
            this.attributes.limit = this.attributes.limit || Sao.config.limit;
            this.view_ids = jQuery.extend([], attributes.view_ids);
            this.view_to_load = jQuery.extend([],
                attributes.mode || ['tree', 'form']);
            this.views = [];
            this.exclude_field = attributes.exclude_field;
            this.context = attributes.context || {};
            this.new_group();
            this.current_view = null;
            this.current_record = null;
            this.domain = attributes.domain || null;
            this.limit = attributes.limit || Sao.config.limit;
            this.offset = 0;
            this.search_count = 0;
            this.screen_container = new Sao.ScreenContainer(
                attributes.tab_domain);
            this.parent = null;
            if (!attributes.row_activate) {
                this.row_activate = this.default_row_activate;
            } else {
                this.row_activate = attributes.row_activate;
            }
            this.tree_states = {};
            this.fields_view_tree = null;
            this.domain_parser = null;
            this.tab = null;
        },
        load_next_view: function() {
            if (!jQuery.isEmptyObject(this.view_to_load)) {
                var view_id;
                if (!jQuery.isEmptyObject(this.view_ids)) {
                    view_id = this.view_ids.shift();
                }
                var view_type = this.view_to_load.shift();
                return this.add_view_id(view_id, view_type);
            }
            return jQuery.when();
        },
        add_view_id: function(view_id, view_type) {
            // TODO preload
            var prm = this.model.execute('fields_view_get',
                    [view_id, view_type], this.context);
            return prm.pipe(this.add_view.bind(this));
        },
        add_view: function(view) {
            var arch = view.arch;
            var fields = view.fields;
            var xml_view = jQuery(jQuery.parseXML(arch));

            if (xml_view.children().prop('tagName') == 'tree') {
                this.fields_view_tree = view;
            }

            var loading = 'eager';
            if (xml_view.children().prop('tagName') == 'form') {
                loading = 'lazy';
            }
            for (var field in fields) {
                if (!(field in this.model.fields) || loading == 'eager') {
                    fields[field].loading = loading;
                } else {
                    fields[field].loading = this.model.fields[field]
                        .description.loading;
                }
            }
            this.model.add_fields(fields);
            var view_widget = Sao.View.parse(this, xml_view, view.field_childs);
            this.views.push(view_widget);

            return view_widget;
        },
        number_of_views: function() {
            return this.views.length + this.view_to_load.length;
        },
        switch_view: function(view_type) {
            // TODO check validity
            if ((!view_type) || (!this.current_view) ||
                    (this.current_view.view_type != view_type)) {
                var switch_current_view = (function() {
                    this.current_view = this.views[this.views.length - 1];
                    return this.switch_view(view_type);
                }.bind(this));
                for (var i = 0; i < this.number_of_views(); i++) {
                    if (this.view_to_load.length) {
                        if (!view_type) {
                            view_type = this.view_to_load[0];
                        }
                        return this.load_next_view().pipe(switch_current_view);
                    }
                    this.current_view = this.views[
                        (this.views.indexOf(this.current_view) + 1) %
                        this.views.length];
                    if (!view_type) {
                        break;
                    } else if (this.current_view.view_type == view_type) {
                        break;
                    }
                }
            }
            this.screen_container.set(this.current_view.el);
            this.display();
            // TODO cursor
            return jQuery.when();
        },
        search_filter: function(search_string) {
            var domain = [];

            if (this.domain_parser && !this.parent) {
                if (search_string || search_string === '') {
                    domain = this.domain_parser.parse(search_string);
                } else {
                    domain = this.attributes.search_value;
                }
                this.screen_container.set_text(
                        this.domain_parser.string(domain));
            } else {
                domain = [['id', 'in', this.group.map(function(r) {
                    return r.id;
                })]];
            }

            if (!jQuery.isEmptyObject(domain) && this.attributes.domain) {
                domain = ['AND', domain, this.attributes.domain];
            } else
                domain = this.attributes.domain || [];

            var tab_domain = this.screen_container.get_tab_domain();
            if (!jQuery.isEmptyObject(tab_domain)) {
                domain = ['AND', domain, tab_domain];
            }

            var grp_prm = this.model.find(domain, this.offset, this.limit,
                    this.attributes.order, this.context);
            var count_prm = this.model.execute('search_count', [domain],
                    this.context);
            count_prm.done(function(count) {
                this.search_count = count;
            }.bind(this));
            grp_prm.done(this.set_group.bind(this));
            grp_prm.done(this.display.bind(this));
            jQuery.when(grp_prm, count_prm).done(function(group, count) {
                this.screen_container.but_next.button('option', 'disabled',
                    !(group.length == this.limit &&
                        count > this.limit + this.offset));
            }.bind(this));
            this.screen_container.but_prev.button('option', 'disabled',
                    this.offset <= 0);
            return grp_prm;
        },
        set_group: function(group) {
            if (this.group) {
                jQuery.extend(group.model.fields, this.group.model.fields);
                this.group.screens.splice(
                        this.group.screens.indexOf(this), 1);
            }
            group.screens.push(this);
            this.group = group;
            this.model = group.model;
            if (jQuery.isEmptyObject(group)) {
                this.set_current_record(null);
            } else {
                this.set_current_record(group[0]);
            }
        },
        new_group: function(ids) {
            var group = new Sao.Group(this.model, this.context, []);
            if (ids) {
                group.load(ids);
            }
            this.set_group(group);
        },
        set_current_record: function(record) {
            this.current_record = record;
            // TODO position
            if (this.tab) {
                if (record) {
                    record.get_attachment_count().always(
                            this.tab.attachment_count.bind(this.tab));
                } else {
                    this.tab.attachment_count(0);
                }
            }
        },
        display: function() {
            if (this.views) {
                this.search_active(~['tree', 'graph', 'calendar'].indexOf(
                            this.current_view.view_type));
                for (var i = 0; i < this.views.length; i++) {
                    if (this.views[i]) {
                        this.views[i].display();
                    }
                }
            }
            this.set_tree_state();
        },
        display_next: function() {
            var view = this.current_view;
            view.set_value();
            // TODO set cursor
            if (~['tree', 'form'].indexOf(view.view_type) &&
                    this.current_record && this.current_record.group) {
                var group = this.current_record.group;
                var record = this.current_record;
                while (group) {
                    var index = group.indexOf(record);
                    if (index < group.length - 1) {
                        record = group[index + 1];
                        break;
                    } else if (group.parent) {
                        record = group.parent;
                        group = group.parent.group;
                    } else {
                        break;
                    }
                }
                this.set_current_record(record);
            } else {
                this.set_current_record(this.group[0]);
            }
            // TODO set cursor
            view.display();
        },
        display_previous: function() {
            var view = this.current_view;
            view.set_value();
            // TODO set cursor
            if (~['tree', 'form'].indexOf(view.view_type) &&
                    this.current_record && this.current_record.group) {
                var group = this.current_record.group;
                var record = this.current_record;
                while (group) {
                    var index = group.indexOf(record);
                    if (index > 0) {
                        record = group[index - 1];
                        break;
                    } else if (group.parent) {
                        record = group.parent;
                        group = group.parent.group;
                    } else {
                        break;
                    }
                }
                this.set_current_record(record);
            } else {
                this.set_current_record(this.group[0]);
            }
            // TODO set cursor
            view.display();
        },
        default_row_activate: function() {
            if ((this.current_view.view_type == 'tree') &&
                    this.current_view.keyword_open) {
                Sao.Action.exec_keyword('tree_open', {
                    'model': this.model_name,
                    'id': this.get_id(),
                    'ids': [this.get_id()]
                    }, jQuery.extend({}, this.context));
            } else {
                this.switch_view('form');
            }
        },
        get_id: function() {
            if (this.current_record) {
                return this.current_record.id;
            }
        },
        new_: function(default_) {
            if (default_ === undefined) {
                default_ = true;
            }
            var prm = jQuery.when();
            if (this.current_view &&
                    ((this.current_view.view_type == 'tree' &&
                      !this.current_view.editable) ||
                     this.current_view.view_type == 'graph')) {
                prm = this.switch_view('form');
            }
            prm.done(function() {
                var group;
                if (this.current_record) {
                    group = this.current_record.group;
                } else {
                    group = this.group;
                }
                var record = group.new_(default_);
                group.add(record, this.new_model_position());
                this.set_current_record(record);
                this.display();
                // TODO set_cursor
            }.bind(this));
        },
        new_model_position: function() {
            var position = -1;
            // TODO editable
            return position;
        },
        cancel_current: function() {
            var prms = [];
            if (this.current_record) {
                this.current_record.cancel();
                if (this.current_record.id < 0) {
                    prms.push(this.remove());
                }
            }
            return jQuery.when.apply(jQuery, prms);
        },
        save_current: function() {
            if (!this.current_record) {
                if ((this.current_view.view_type == 'tree') &&
                        (!jQuery.isEmptyObject(this.group))) {
                    this.set_current_record(this.group[0]);
                } else {
                    return true;
                }
            }
            this.current_view.set_value();
            var fields = this.current_view.get_fields();
            // TODO path
            var prm = jQuery.Deferred();
            if (this.current_view.view_type == 'tree') {
                prm = this.group.save();
            } else {
                this.current_record.validate(fields).then(function(validate) {
                    if (validate) {
                        this.current_record.save().then(
                            prm.resolve, prm.reject);
                    } else {
                        // TODO set_cursor
                        this.current_view.display();
                        prm.reject();
                    }
                }.bind(this));
            }
            prm.always(function() {
                this.display();
            }.bind(this));
            return prm;
        },
        modified: function() {
            var test = function(record) {
                return (record.has_changed() || record.id < 0);
            };
            if (this.current_view.view_type != 'tree') {
                if (this.current_record) {
                    if (test(this.current_record)) {
                        return true;
                    }
                }
            } else {
                if (this.group.some(test)) {
                    return true;
                }
            }
            // TODO test view modified
            return false;
        },
        unremove: function() {
            var records = this.current_view.selected_records();
            records.forEach(function(record) {
                record.group.unremove(record);
            });
        },
        remove: function(delete_, remove, force_remove) {
            var records = null;
            if ((this.current_view.view_type == 'form') &&
                    this.current_record) {
                records = [this.current_record];
            } else if (this.current_view.view_type == 'tree') {
                records = this.current_view.selected_records();
            }
            if (jQuery.isEmptyObject(records)) {
                return;
            }
            var prm = jQuery.when();
            if (delete_) {
                // TODO delete children before parent
                prm = this.model.delete_(records);
            }
            return prm.then(function() {
                records.forEach(function(record) {
                    record.group.remove(record, remove, true, force_remove);
                });
                var prms = [];
                if (delete_) {
                    records.forEach(function(record) {
                        if (record.group.parent) {
                            prms.push(record.group.parent.save());
                        }
                        if (~record.group.record_deleted.indexOf(record)) {
                            record.group.record_deleted.splice(
                                record.group.record_deleted.indexOf(record), 1);
                        }
                        if (~record.group.record_removed.indexOf(record)) {
                            record.group.record_removed.splice(
                                record.group.record_removed.indexOf(record), 1);
                        }
                        // TODO destroy
                    });
                }
                // TODO set current_record
                this.set_current_record(null);
                // TODO set_cursor
                return jQuery.when.apply(jQuery, prms).then(function() {
                    this.display();
                }.bind(this));
            }.bind(this));
        },
        copy: function() {
            var records = this.current_view.selected_records();
            return this.model.copy(records, this.context).then(function(new_ids) {
                this.group.load(new_ids);
                if (!jQuery.isEmptyObject(new_ids)) {
                    this.set_current_record(this.group.get(new_ids[0]));
                }
                this.display();
            }.bind(this));
        },
        search_active: function(active) {
            if (active && !this.group.parent) {
                if (!this.fields_view_tree) {
                    this.model.execute('fields_view_get',
                            [false, 'tree'], this.context)
                        .then(function(view) {
                            this.fields_view_tree = view;
                            this.search_active(active);
                        }.bind(this));
                    return;
                }
                if (!this.domain_parser) {
                    var fields = jQuery.extend({},
                            this.fields_view_tree.fields);

                    var set_selection = function(props) {
                        return function(selection) {
                            props.selection = selection;
                        };
                    };
                    for (var name in fields) {
                        if (!fields.hasOwnProperty(name)) {
                            continue;
                        }
                        var props = fields[name];
                        if ((props.type != 'selection') &&
                                (props.type != 'reference')) {
                            continue;
                        }
                        if (props.selection instanceof Array) {
                            continue;
                        }
                        this.get_selection(props).then(set_selection);
                    }

                    // Filter only fields in XML view
                    var xml_view = jQuery(jQuery.parseXML(
                                this.fields_view_tree.arch));
                    var xml_fields = xml_view.find('tree').children()
                        .filter(function(node) {
                            return node.tagName == 'field';
                        }).map(function(node) {
                            return node.getAttribute('name');
                        });
                    var dom_fields = {};
                    xml_fields.each(function(name) {
                        dom_fields[name] = fields[name];
                    });
                    [
                        ['id', 'ID', 'integer'],
                        ['create_uid', 'Creation User', 'many2one'],
                        ['create_date', 'Creation Date', 'datetime'],
                        ['write_uid', 'Modification User', 'many2one'],
                        ['write_date', 'Modification Date', 'datetime']
                            ] .forEach(function(e) {
                                var name = e[0];
                                var string = e[1];
                                var type = e[2];
                                if (!(name in fields)) {
                                    fields[name] = {
                                        'string': string,
                                        'name': name,
                                        'type': type
                                    };
                                    if (type == 'datetime') {
                                        fields[name].format = '"%H:%M:%S"';
                                    }
                                }
                            });
                    if (!('id' in fields)) {
                        fields.id = {
                            'string': 'ID',  // TODO translate
                            'name': 'id',
                            'type': 'integer'
                        };
                    }
                    this.domain_parser = new Sao.common.DomainParser(fields);
                }
                this.screen_container.set_screen(this);
                this.screen_container.show_filter();
            } else {
                this.screen_container.hide_filter();
            }
        },
        get_selection: function(props) {
            var prm;
            var change_with = props.selection_change_with;
            if (change_with) {
                var values = {};
                change_with.forEach(function(p) {
                    values[p] = null;
                });
                prm = this.model.execute(props.selection,
                        [values]);
            } else {
                prm = this.model.execute(props.selection,
                        []);
            }
            return prm.then(function(selection) {
                return selection.sort(function(a, b) {
                    return a[1].localeCompare(b[1]);
                });
            });
        },
        search_prev: function(search_string) {
            this.offset -= this.limit;
            this.search_filter(search_string);
        },
        search_next: function(search_string) {
            this.offset += this.limit;
            this.search_filter(search_string);
        },
        get: function() {
            if (!this.current_record) {
                return null;
            }
            this.current_view.set_value();
            return this.current_record.get();
        },
        get_on_change_value: function() {
            if (!this.current_record) {
                return null;
            }
            this.current_view.set_value();
            return this.current_record.get_on_change_value();
        },
        reload: function(ids, written) {
            this.group.reload(ids);
            if (written) {
                this.group.written(ids);
            }
            if (this.parent) {
                this.parent.reload();
            }
            this.display();
        },
        button: function(attributes) {
            // TODO confirm
            var record = this.current_record;
            record.save().done(function() {
                var context = record.get_context();
                record.model.execute(attributes.name,
                    [[record.id]], context).then(
                        function(action_id) {
                            if (action_id) {
                                Sao.Action.execute(action_id, {
                                    model: this.model_name,
                                    id: record.id,
                                    ids: [record.id]
                                }, null, context);
                            }
                            this.reload([record.id], true);
                        }.bind(this),
                        function() {
                            this.reload([record.id], true);
                        }.bind(this));
            }.bind(this));
        },
        save_tree_state: function(store) {
            store = (store === undefined) ? true : store;
            var i, len, view, widgets, wi, wlen;
            for (i = 0, len = this.views.length; i < len; i++) {
                view = this.views[i];
                if (view.view_type == 'form') {
                    for (var wid_key in view.widgets) {
                        if (!view.widgets.hasOwnProperty(wid_key)) {
                            continue;
                        }
                        widgets = view.widgets[wid_key];
                        for (wi = 0, wlen = widgets.length; wi < wlen; wi++) {
                            if (widgets[wi].screen) {
                                widgets[wi].screen.save_tree_state(store);
                            }
                        }
                    }
                } else if ((view.view_type == 'tree') &&
                        (view.children_field)) {
                    var parent_, paths, selected_paths, tree_state_model;
                    parent_ = this.parent ? this.parent.id : null;
                    paths = view.get_expanded_paths();
                    selected_paths = view.get_selected_paths();
                    if (!(parent_ in this.tree_states)) {
                        this.tree_states[parent_] = {};
                    }
                    this.tree_states[parent_][view.children_field] = [paths,
                        selected_paths];
                    if (store) {
                        tree_state_model = new Sao.Model(
                                'ir.ui.view_tree_state');
                        tree_state_model.execute('set', [
                                this.model_name,
                                this.get_tree_domain(parent_),
                                view.children_field,
                                JSON.stringify(paths),
                                JSON.stringify(selected_paths)], {});
                    }
                }
            }
        },
        get_tree_domain: function(parent_) {
            var domain;
            if (parent_) {
                domain = this.domain.concat([
                        [this.exclude_field, '=', parent_]]);
            } else {
                domain = this.domain;
            }
            return JSON.stringify(Sao.rpc.prepareObject(domain));
        },
        set_tree_state: function() {
            var parent_, state, state_prm, tree_state_model;
            var view = this.current_view;
            if (!view || (view.view_type != 'tree') || !this.group) {
                return;
            }
            parent_ = this.parent ? this.parent.id : null;
            if (!(parent_ in this.tree_states)) {
                this.tree_states[parent_] = {};
            }
            state = this.tree_states[parent_][view.children_field];
            if (state === undefined) {
                tree_state_model = new Sao.Model('ir.ui.view_tree_state');
                state_prm = tree_state_model.execute('get', [
                        this.model_name,
                        this.get_tree_domain(parent_),
                        view.children_field], {});
            } else {
                state_prm = jQuery.when(state);
            }
            state_prm.done(function(state) {
                var expanded_nodes, selected_nodes;
                this.tree_states[parent_][view.children_field] = state;
                expanded_nodes = JSON.parse(state[0]);
                selected_nodes = JSON.parse(state[1]);
                view.display(selected_nodes, expanded_nodes);
            }.bind(this));
        }
    });
}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.View = Sao.class_(Object, {
        init: function(screen, xml) {
            this.screen = screen;
            this.view_type = null;
            this.el = null;
            this.fields = {};
        },
        set_value: function() {
        },
        get_fields: function() {
            return Object.keys(this.fields);
        }
    });

    Sao.View.idpath2path = function(tree, idpath) {
        var path = [];
        var child_path;
        if (!idpath) {
            return [];
        }
        for (var i = 0, len = tree.rows.length; i < len; i++) {
            if (tree.rows[i].record.id == idpath[0]) {
                path.push(i);
                child_path = Sao.View.idpath2path(tree.rows[i],
                        idpath.slice(1, idpath.length));
                path = path.concat(child_path);
                break;
            }
        }
        return path;
    };

    Sao.View.parse = function(screen, xml, children_field) {
        switch (xml.children().prop('tagName')) {
            case 'tree':
                return new Sao.View.Tree(screen, xml, children_field);
            case 'form':
                return new Sao.View.Form(screen, xml);
        }
    };

    Sao.View.tree_column_get = function(type) {
        switch (type) {
            case 'char':
                return Sao.View.Tree.CharColumn;
            case 'many2one':
                return Sao.View.Tree.Many2OneColumn;
            case 'date':
                return Sao.View.Tree.DateColumn;
            case 'datetime':
                return Sao.View.Tree.DateTimeColumn;
            case 'time':
                return Sao.View.Tree.TimeColumn;
            case 'one2many':
                return Sao.View.Tree.One2ManyColumn;
            case 'many2many':
                return Sao.View.Tree.Many2ManyColumn;
            case 'selection':
                return Sao.View.Tree.SelectionColumn;
            case 'reference':
                return Sao.View.Tree.ReferenceColumn;
            case 'float':
            case 'numeric':
                return Sao.View.Tree.FloatColumn;
            case 'float_time':
                return Sao.View.Tree.FloatTimeColumn;
            case 'integer':
            case 'biginteger':
                return Sao.View.Tree.IntegerColumn;
            case 'boolean':
                return Sao.View.Tree.BooleanColumn;
            default:
                return Sao.View.Tree.CharColumn;
        }
    };

    Sao.View.Tree = Sao.class_(Sao.View, {
        init: function(screen, xml, children_field) {
            Sao.View.Tree._super.init.call(this, screen, xml);
            this.view_type = 'tree';
            this.selection_mode = (screen.attributes.selection_mode ||
                Sao.common.SELECTION_SINGLE);
            this.el = jQuery('<div/>', {
                'class': 'treeview'
            });
            this.expanded = {};
            this.children_field = children_field;
            this.keyword_open = xml.children()[0].getAttribute('keyword_open');

            // Columns
            this.columns = [];
            this.create_columns(screen.model, xml);

            // Table of records
            this.rows = [];
            this.table = jQuery('<table/>', {
                'class': 'tree'
            });
            this.el.append(this.table);
            var thead = jQuery('<thead/>');
            this.table.append(thead);
            var tr = jQuery('<tr/>');
            if (this.selection_mode != Sao.common.SELECTION_NONE) {
                var th = jQuery('<th/>');
                this.selection = jQuery('<input/>', {
                    'type': 'checkbox',
                    'class': 'selection'
                });
                this.selection.change(this.selection_changed.bind(this));
                th.append(this.selection);
                tr.append(th);
            }
            thead.append(tr);
            this.columns.forEach(function(column) {
                th = jQuery('<th/>', {
                    'text': column.attributes.string
                });
                if (column.attributes.tree_invisible) {
                    th.hide();
                }
                tr.append(th);
            });
            this.tbody = jQuery('<tbody/>');
            this.table.append(this.tbody);

            // Footer for more
            var footer = jQuery('<div/>', {
                'class': 'treefooter'
            });
            this.more = jQuery('<button/>').button({
                'label': 'More' // TODO translation
            }).click(function() {
                this.display_size += Sao.config.display_size;
                this.display();
            }.bind(this));
            footer.append(this.more);
            this.display_size = Sao.config.display_size;
            this.el.append(footer);
        },
        create_columns: function(model, xml) {
            xml.find('tree').children().each(function(pos, child) {
                var column, attribute;
                var attributes = {};
                for (var i = 0, len = child.attributes.length; i < len; i++) {
                    attribute = child.attributes[i];
                    attributes[attribute.name] = attribute.value;
                }
                ['readonly', 'tree_invisible', 'expand', 'completion'].forEach(
                    function(name) {
                        if (attributes[name]) {
                            attributes[name] = attributes[name] == 1;
                        }
                    });
                if (child.tagName == 'field') {
                    var name = child.getAttribute('name');
                    if (name == this.screen.exclude_field) {
                        // TODO is it really the way to do it
                        return;
                    }
                    if (!attributes.widget) {
                        attributes.widget = model.fields[name].description.type;
                    }
                    var attribute_names = ['relation', 'domain', 'selection',
                        'relation_field', 'string', 'views', 'invisible',
                        'add_remove', 'sort', 'context', 'filename'];
                    for (i in attribute_names) {
                        var attr = attribute_names[i];
                        if ((attr in model.fields[name].description) &&
                            (child.getAttribute(attr) === null)) {
                            attributes[attr] = model.fields[name]
                                .description[attr];
                        }
                    }
                    var ColumnFactory = Sao.View.tree_column_get(
                        attributes.widget);
                    column = new ColumnFactory(model, attributes);

                    var prefixes = [], suffixes = [];
                    // TODO support for url/email/callto/sip
                    if ('icon' in attributes) {
                        column.prefixes.push(new Sao.View.Tree.Affix(this,
                                    attributes));
                    }
                    var affix, affix_attributes;
                    var affixes = child.childNodes;
                    for (i = 0; i < affixes.length; i++) {
                        affix = affixes[i];
                        affix_attributes = {};
                        for (i = 0, len = affix.attributes.length; i < len;
                                i++) {
                            attribute = affix.attributes[i];
                            affix_attributes[attribute.name] = attribute.value;
                        }
                        if (affix.tagName == 'prefix') {
                            column.prefixes.push(new Sao.View.Tree.Affix(name,
                                        affix_attributes));
                        } else {
                            column.suffixes.push(new Sao.View.Tree.Affix(name,
                                        affix_attributes));
                        }
                    }

                    this.fields[name] = true;
                    // TODO sum
                } else if (child.tagName == 'button') {
                    column = new Sao.View.Tree.ButtonColumn(this.screen,
                            attributes);
                }
                this.columns.push(column);
            }.bind(this));
        },
        display: function(selected, expanded) {
            selected = selected || this.get_selected_paths();
            expanded = expanded || [];
            var current_record = this.screen.current_record;
            if (current_record && !Sao.common.contains(selected,
                        [[current_record.id]])) {
                selected = [[current_record.id]];
            }
            this.rows = [];
            this.tbody.empty();
            var add_row = function(record, pos, group) {
                var tree_row = new Sao.View.Tree.Row(this, record, pos);
                this.rows.push(tree_row);
                tree_row.display(selected, expanded);
            };
            this.screen.group.slice(0, this.display_size).forEach(add_row.bind(this));
            if (this.display_size >= this.screen.group.length) {
                this.more.hide();
            } else {
                this.more.show();
            }
        },
        switch_: function(path) {
            this.screen.row_activate();
        },
        select_changed: function(record) {
            this.screen.set_current_record(record);
            // TODO validate if editable
            // TODO update_children
        },
        selected_records: function() {
            if (this.selection_mode == Sao.common.SELECTION_NONE) {
                return [];
            }
            var records = [];
            var add_record = function(row) {
                if (row.is_selected()) {
                    records.push(row.record);
                }
                row.rows.forEach(add_record);
            };
            this.rows.forEach(add_record);
            if (this.selection.prop('checked') &&
                    !this.selection.prop('indeterminate')) {
                this.screen.group.slice(this.rows.length)
                    .forEach(function(record) {
                        records.push(record);
                    });
            }
            return records;
        },
        selection_changed: function() {
            var value = this.selection.prop('checked');
            var set_checked = function(row) {
                row.set_selection(value);
                row.rows.forEach(set_checked);
            };
            this.rows.forEach(set_checked);
            if (value && this.rows[0]) {
                this.select_changed(this.rows[0].record);
            } else {
                this.select_changed(null);
            }
        },
        update_selection: function() {
            if (this.selection.prop('checked')) {
                return;
            }
            var selected_records = this.selected_records();
            this.selection.prop('indeterminate', false);
            if (jQuery.isEmptyObject(selected_records)) {
                this.selection.prop('checked', false);
            } else if (selected_records.length ==
                    this.tbody.children().length &&
                    this.display_size >= this.screen.group.length) {
                this.selection.prop('checked', true);
            } else {
                this.selection.prop('indeterminate', true);
                // Set checked to go first unchecked after first click
                this.selection.prop('checked', true);
            }
        },
        get_selected_paths: function() {
            var selected_paths = [];
            function get_selected(row, path) {
                var i, r, len, r_path;
                for (i = 0, len = row.rows.length; i < len; i++) {
                    r = row.rows[i];
                    r_path = path.concat([r.record.id]);
                    if (r.is_selected()) {
                        selected_paths.push(r_path);
                    }
                    get_selected(r, r_path);
                }
            }
            get_selected(this, []);
            return selected_paths;
        },
        get_expanded_paths: function(starting_path, starting_id_path) {
            var id_path, id_paths, row, children_rows, path;
            if (starting_path === undefined) {
                starting_path = [];
            }
            if (starting_id_path === undefined) {
                starting_id_path = [];
            }
            id_paths = [];
            row = this.find_row(starting_path);
            children_rows = row ? row.rows : this.rows;
            for (var path_idx = 0, len = this.n_children(row) ;
                    path_idx < len ; path_idx++) {
                path = starting_path.concat([path_idx]);
                row = children_rows[path_idx];
                if (row.is_expanded()) {
                    id_path = starting_id_path.concat(row.record.id);
                    id_paths.push(id_path);
                    id_paths = id_paths.concat(this.get_expanded_paths(path,
                                id_path));
                }
            }
            return id_paths;
        },
        find_row: function(path) {
            var index;
            var row = null;
            var group = this.rows;
            for (var i=0, len=path.length; i < len; i++) {
                index = path[i];
                if (!group || index >= group.length) {
                    return null;
                }
                row = group[index];
                group = row.rows;
                if (!this.children_field) {
                    break;
                }
            }
            return row;
        },
        n_children: function(row) {
            if (!row || !this.children_field) {
                return this.rows.length;
            }
            return row.record._values[this.children_field].length;
        }
    });

    Sao.View.Tree.Row = Sao.class_(Object, {
        init: function(tree, record, pos, parent) {
            this.tree = tree;
            this.rows = [];
            this.record = record;
            this.parent_ = parent;
            this.children_field = tree.children_field;
            this.expander = null;
            var path = [];
            if (parent) {
                path = jQuery.extend([], parent.path.split('.'));
            }
            path.push(pos);
            this.path = path.join('.');
            this.el = jQuery('<tr/>');
            if (this.tree.selection_mode != Sao.common.SELECTION_NONE) {
                var td = jQuery('<td/>');
                this.el.append(td);
                this.selection = jQuery('<input/>', {
                    'type': 'checkbox',
                    'class': 'selection'
                });
                this.selection.change(this.selection_changed.bind(this));
                td.append(this.selection);
            }
        },
        is_expanded: function() {
            return (this.path in this.tree.expanded);
        },
        get_last_child: function() {
            if (!this.children_field || !this.is_expanded() ||
                    jQuery.isEmptyObject(this.rows)) {
                return this;
            }
            return this.rows[this.rows.length - 1].get_last_child();
        },
        get_id_path: function() {
            if (!this.parent_) {
                return [this.record.id];
            }
            return this.parent_.get_id_path().concat([this.record.id]);
        },
        display: function(selected, expanded) {
            selected = selected || [];
            expanded = expanded || [];
            var idx;
            var depth = this.path.split('.').length;
            var update_expander = function() {
                if (jQuery.isEmptyObject(
                            this.record.field_get(
                                this.children_field))) {

                    this.expander.css('background', 'none');
                }
            };
            // Use this handler to allow customization of select_row for the
            // menu
            var click_handler = function(event_) {
                this.select_row(event_);
            };
            for (var i = 0; i < this.tree.columns.length; i++) {
                var td = jQuery('<td/>');
                td.click(click_handler.bind(this));
                var table = jQuery('<table/>');
                table.css('width', '100%');
                td.append(table);
                var row = jQuery('<tr/>');
                table.append(row);
                if ((i === 0) && this.children_field) {
                    var expanded_icon = 'ui-icon-plus';
                    if (this.is_expanded() ||
                            ~expanded.indexOf(this.record.id)) {
                        expanded_icon = 'ui-icon-minus';
                    }
                    this.expander = jQuery('<span/>', {
                        'class': 'ui-icon ' + expanded_icon
                    });
                    this.expander.html('&nbsp;');
                    this.expander.css('margin-left', (depth - 1) + 'em');
                    this.expander.css('float', 'left');
                    this.expander.click(this.toggle_row.bind(this));
                    row.append(jQuery('<td/>').append(this.expander
                                ).css('width', 1));
                    this.record.load(this.children_field).done(
                            update_expander.bind(this));
                }
                var column = this.tree.columns[i];
                var j;
                for (j = 0; j < column.prefixes.length; j++) {
                    var prefix = column.prefixes[j];
                    row.append(jQuery('<td/>').append(
                                prefix.render(this.record)).css('width', 1));
                }
                row.append(jQuery('<td/>').append(
                            column.render(this.record)));
                for (j = 0; j < column.suffixes.length; j++) {
                    var suffix = column.suffixes[j];
                    row.append(jQuery('<td/>').append(
                                suffix.render(this.record)).css('width', 1));
                }
                if (column.attributes.tree_invisible) {
                    td.hide();
                }
                this.el.append(td);
            }
            var row_id_path = this.get_id_path();
            this.set_selection(Sao.common.contains(selected, row_id_path));
            if (this.parent_) {
                var last_child = this.parent_.get_last_child();
                last_child.el.after(this.el);
            } else {
                this.tree.tbody.append(this.el);
            }
            if (this.is_expanded() ||
                    Sao.common.contains(expanded, row_id_path)) {
                this.tree.expanded[this.path] = this;
                var add_children = function() {
                    var add_row = function(record, pos, group) {
                        var tree_row = new Sao.View.Tree.Row(this.tree, record,
                                pos, this);
                        tree_row.display(selected, expanded);
                        this.rows.push(tree_row);
                    };
                    var children = this.record.field_get_client(
                            this.children_field);
                    children.forEach(add_row.bind(this));
                };
                this.record.load(this.children_field).done(
                        add_children.bind(this));
            }
            if (this.record.deleted() || this.record.removed()) {
                this.el.css('text-decoration', 'line-through');
            } else {
                this.el.css('text-decoration', 'inherit');
            }
        },
        toggle_row: function() {
            if (this.is_expanded()) {
                this.expander.removeClass('ui-icon-minus');
                this.expander.addClass('ui-icon-plus');
                delete this.tree.expanded[this.path];
            } else {
                this.expander.removeClass('ui-icon-plus');
                this.expander.addClass('ui-icon-minus');
                this.tree.expanded[this.path] = this;
            }
            this.tree.display();
        },
        select_row: function(event_) {
            if (this.tree.selection_mode == Sao.common.SELECTION_NONE) {
                this.tree.select_changed(this.record);
                this.tree.switch_(this.path);
            } else {
                if (!event_.ctrlKey) {
                    this.tree.rows.forEach(function(row) {
                        if (row != this) {
                            row.set_selection(false);
                        }
                    }.bind(this));
                    this.selection_changed();
                    if (this.is_selected()) {
                        this.tree.switch_(this.path);
                        return;
                    }
                }
                this.set_selection(!this.is_selected());
                this.selection_changed();
            }
        },
        is_selected: function() {
            if (this.tree.selection_mode == Sao.common.SELECTION_NONE) {
                return false;
            }
            return this.selection.prop('checked');
        },
        set_selection: function(value) {
            if (this.tree.selection_mode == Sao.common.SELECTION_NONE) {
                return;
            }
            this.selection.prop('checked', value);
            if (!value) {
                this.tree.selection.prop('checked', false);
            }
        },
        selection_changed: function() {
            var is_selected = this.is_selected();
            this.set_selection(is_selected);
            if (is_selected) {
                this.tree.select_changed(this.record);
            } else {
                this.tree.select_changed(
                        this.tree.selected_records()[0] || null);
            }
            this.tree.update_selection();
        }
    });

    Sao.View.Tree.Affix = Sao.class_(Object, {
        init: function(name, attributes, protocol) {
            this.name = attributes.name || name;
            this.attributes = attributes;
            this.protocol = protocol || null;
            this.icon = attributes.icon;
            if (this.protocol && !this.icon) {
                this.icon = 'tryton-web-browser';
            }
        },
        get_cell: function() {
            var cell;
            if (this.protocol) {
                cell = jQuery('<a/>');
                cell.append(jQuery('<img/>'));
            } else if (this.icon) {
                cell = jQuery('<img/>');
            } else {
                cell = jQuery('<span/>');
            }
            cell.addClass('column-affix');
            return cell;
        },
        render: function(record) {
            var cell = this.get_cell();
            record.load(this.name).done(function() {
                var value, icon_prm;
                var field = record.model.fields[this.name];
                //TODO set_state
                if (this.icon) {
                    if (this.icon in record.model.fields) {
                        var icon_field = record.model.fields[this.icon];
                        value = icon_field.get_client(record);
                    }
                    else {
                        value = this.icon;
                    }
                    icon_prm = Sao.common.ICONFACTORY.register_icon(value);
                    icon_prm.done(function(url) {
                        var img_tag;
                        if (cell.children('img').length) {
                            img_tag = cell.children('img');
                        } else {
                            img_tag = cell;
                        }
                        img_tag.attr('src', url);
                    }.bind(this));
                } else {
                    value = this.attributes.string || '';
                    if (!value) {
                        value = field.get_client(record) || '';
                    }
                    cell.text(value);
                }
            }.bind(this));
            return cell;
        }
    });

    Sao.View.Tree.CharColumn = Sao.class_(Object, {
        class_: 'column-char',
        init: function(model, attributes) {
            this.type = 'field';
            this.model = model;
            this.field = model.fields[attributes.name];
            this.attributes = attributes;
            this.prefixes = [];
            this.suffixes = [];
        },
        get_cell: function() {
            var cell = jQuery('<div/>');
            cell.addClass(this.class_);
            return cell;
        },
        update_text: function(cell, record) {
            cell.text(this.field.get_client(record));
        },
        render: function(record) {
            var cell = this.get_cell();
            record.load(this.attributes.name).done(function() {
                this.update_text(cell, record);
                this.field.set_state(record);
                var state_attrs = this.field.get_state_attrs(record);
                if (state_attrs.invisible) {
                    cell.hide();
                } else {
                    cell.show();
                }
                // TODO editable: readonly and required
            }.bind(this));
            return cell;
        }
    });

    Sao.View.Tree.IntegerColumn = Sao.class_(Sao.View.Tree.CharColumn, {
        class_: 'column-integer',
        get_cell: function() {
            var cell = Sao.View.Tree.IntegerColumn._super.get_cell.call(this);
            cell.css('text-align', 'right');
            return cell;
        }
    });

    Sao.View.Tree.FloatColumn = Sao.class_(Sao.View.Tree.IntegerColumn, {
        class_: 'column-float'
    });

    Sao.View.Tree.BooleanColumn = Sao.class_(Sao.View.Tree.IntegerColumn, {
        class_: 'column-boolean',
        get_cell: function() {
            return jQuery('<input/>', {
                'type': 'checkbox',
                'disabled': true,
                'class': this.class_
            });
        },
        update_text: function(cell, record) {
            cell.prop('checked', this.field.get(record));
        }
    });

    Sao.View.Tree.Many2OneColumn = Sao.class_(Sao.View.Tree.CharColumn, {
        class_: 'column-many2one'
    });

    Sao.View.Tree.SelectionColumn = Sao.class_(Sao.View.Tree.CharColumn, {
        class_: 'column-selection',
        init: function(model, attributes) {
            Sao.View.Tree.SelectionColumn._super.init.call(this, model,
                attributes);
            Sao.common.selection_mixin.init.call(this);
            this.init_selection();
        },
        init_selection: function(key) {
            Sao.common.selection_mixin.init_selection.call(this, key);
        },
        update_selection: function(record, callback) {
            Sao.common.selection_mixin.update_selection.call(this, record,
                this.field, callback);
        },
        update_text: function(cell, record) {
            this.update_selection(record, function() {
                var value = this.field.get(record);
                var prm, text, found = false;
                for (var i = 0, len = this.selection.length; i < len; i++) {
                    if (this.selection[i][0] === value) {
                        found = true;
                        text = this.selection[i][1];
                        break;
                    }
                }
                if (!found) {
                    prm = Sao.common.selection_mixin.get_inactive_selection
                        .call(this, value).then(function(inactive) {
                            return inactive[1];
                        });
                } else {
                    prm = jQuery.when(text);
                }
                prm.done(function(text_value) {
                    cell.text(text_value);
                }.bind(this));
            }.bind(this));
        }
    });

    Sao.View.Tree.ReferenceColumn = Sao.class_(Sao.View.Tree.CharColumn, {
        class_: 'column-reference',
        init: function(model, attributes) {
            Sao.View.Tree.ReferenceColumn._super.init.call(this, model,
                attributes);
            Sao.common.selection_mixin.init.call(this);
            this.init_selection();
        },
        init_selection: function(key) {
            Sao.common.selection_mixin.init_selection.call(this, key);
        },
        update_text: function(cell, record) {
            var value = this.field.get_client(record);
            var model, name;
            if (!value) {
                model = '';
                name = '';
            } else {
                model = value[0];
                name = value[1];
            }
            if (model) {
                cell.text(this.selection[model] || model + ',' + name);
            } else {
                cell.text(name);
            }
        }
    });

    Sao.View.Tree.DateColumn = Sao.class_(Sao.View.Tree.CharColumn, {
        class_: 'column-date'
    });

    Sao.View.Tree.DateTimeColumn = Sao.class_(Sao.View.Tree.CharColumn, {
        class_: 'column-datetime'
    });

    Sao.View.Tree.TimeColumn = Sao.class_(Sao.View.Tree.CharColumn, {
        class_: 'column-time'
    });

    Sao.View.Tree.One2ManyColumn = Sao.class_(Sao.View.Tree.CharColumn, {
        class_: 'column-one2many',
        update_text: function(cell, record) {
            cell.text('( ' + this.field.get_client(record).length + ' )');
        }
    });

    Sao.View.Tree.Many2ManyColumn = Sao.class_(Sao.View.Tree.One2ManyColumn, {
        class_: 'column-many2many'
    });

    Sao.View.Tree.FloatTimeColumn = Sao.class_(Sao.View.Tree.CharColumn, {
        class_: 'column-float_time',
        init: function(model, attributes) {
            Sao.View.Tree.FloatTimeColumn._super.init.call(this, model,
                attributes);
            this.conv = null; // TODO
        },
        update_text: function(cell, record) {
            cell.text(Sao.common.text_to_float_time(
                    this.field.get_client(record), this.conv));
        }
    });

    Sao.View.Tree.ButtonColumn = Sao.class_(Object, {
        init: function(screen, attributes) {
            this.screen = screen;
            this.type = 'button';
            this.attributes = attributes;
        },
        render: function(record) {
            var button = new Sao.common.Button(this.attributes);
            button.el.click(record, this.button_clicked.bind(this));
            var fields = jQuery.map(this.screen.model.fields,
                function(field, name) {
                    if ((field.description.loading || 'eager') ==
                        'eager') {
                        return name;
                    } else {
                        return undefined;
                    }
                });
            // Wait at least one eager field is loaded before evaluating states
            record.load(fields[0]).done(function() {
                button.set_state(record);
            });
            return button.el;
        },
        button_clicked: function(event) {
            var record = event.data;
            if (record != this.screen.current_record) {
                return;
            }
            // TODO check state
            this.screen.button(this.attributes);
        }
    });

    Sao.View.Form = Sao.class_(Sao.View, {
        init: function(screen, xml) {
            Sao.View.Form._super.init.call(this, screen, xml);
            this.view_type = 'form';
            this.el = jQuery('<div/>', {
                'class': 'form'
            });
            this.widgets = {};
            this.widget_id = 0;
            this.state_widgets = [];
            this.containers = [];
            var root = xml.children()[0];
            var container = this.parse(screen.model, root);
            this.el.append(container.el);
        },
        parse: function(model, node, container) {
            if (container === undefined) {
                container = new Sao.View.Form.Container(
                    Number(node.getAttribute('col') || 4));
                this.containers.push(container);
            }
            var _parse = function(index, child) {
                var attributes = {};
                for (var i = 0, len = child.attributes.length; i < len; i++) {
                    var attribute = child.attributes[i];
                    attributes[attribute.name] = attribute.value;
                }
                ['readonly', 'invisible'].forEach(function(name) {
                    if (attributes[name]) {
                        attributes[name] = attributes[name] == 1;
                    }
                });
                ['yexpand', 'yfill', 'xexpand', 'xfill', 'colspan'].forEach(
                        function(name) {
                            if (attributes[name]) {
                                attributes[name] = Number(attributes[name]);
                            }
                        });
                switch (child.tagName) {
                    case 'image':
                        // TODO
                        break;
                    case 'separator':
                        this._parse_separator(
                                model, child, container, attributes);
                        break;
                    case 'label':
                        this._parse_label(model, child, container, attributes);
                        break;
                    case 'newline':
                        container.add_row();
                        break;
                    case 'button':
                        this._parse_button(child, container, attributes);
                        break;
                    case 'notebook':
                        this._parse_notebook(
                                model, child, container, attributes);
                        break;
                    case 'page':
                        this._parse_page(model, child, container, attributes);
                        break;
                    case 'field':
                        this._parse_field(model, child, container, attributes);
                        break;
                    case 'group':
                        this._parse_group(model, child, container, attributes);
                        break;
                    case 'hpaned':
                        // TODO
                        break;
                    case 'vpaned':
                        // TODO
                        break;
                    case 'child':
                        // TODO
                        break;
                }
            };
            jQuery(node).children().each(_parse.bind(this));
            return container;
        },
        _parse_separator: function(model, node, container, attributes) {
            var name = attributes.name;
            var text = attributes.string;
            if (name in model.fields) {
                if (!attributes.states && (name in model.fields)) {
                    attributes.states = model.fields[name].description.states;
                }
                if (!text) {
                    text = model.fields[name].description.string;
                }
            }
            var separator = new Sao.View.Form.Separator(text, attributes);
            this.state_widgets.push(separator);
            container.add(attributes, separator);
        },
        _parse_label: function(model, node, container, attributes) {
            var name = attributes.name;
            var text = attributes.string;
            if (attributes.xexpand === undefined) {
                attributes.xexpand = 0;
            }
            if (name in model.fields) {
                if (name == this.screen.exclude_field) {
                    container.add(attributes);
                    return;
                }
                if (!attributes.states && (name in model.fields)) {
                    attributes.states = model.fields[name].description.states;
                }
                if (!text) {
                    // TODO RTL and translation
                    text = model.fields[name]
                        .description.string + ':';
                }
                if (node.getAttribute('xalign') === undefined) {
                    node.setAttribute('xalign', 1.0);
                }
            } else if (!text) {
                // TODO get content
            }
            var label;
            if (text) {
                label = new Sao.View.Form.Label(text, attributes);
                this.state_widgets.push(label);
            }
            container.add(attributes, label);
            // TODO help
        },
        _parse_button: function(node, container, attributes) {
            var button = new Sao.common.Button(attributes);
            this.state_widgets.push(button);
            container.add(attributes, button);
            button.el.click(button, this.button_clicked.bind(this));
            // TODO help
        },
        _parse_notebook: function(model, node, container, attributes) {
            if (attributes.colspan === undefined) {
                attributes.colspan = 4;
            }
            var notebook = new Sao.View.Form.Notebook(attributes);
            this.state_widgets.push(notebook);
            container.add(attributes, notebook);
            this.parse(model, node, notebook);
        },
        _parse_page: function(model, node, container, attributes) {
            var text = attributes.string;
            if (attributes.name in model.fields) {
                // TODO check exclude
                // sync attributes
                if (!text) {
                    text = model.fields[attributes.name]
                        .description.string;
                }
            }
            if (!text) {
                text = 'No String Attr.'; // TODO translate
            }
            var page = this.parse(model, node);
            page = new Sao.View.Form.Page(container.add(page.el, text),
                    attributes);
            this.state_widgets.push(page);
        },
        _parse_field: function(model, node, container, attributes) {
            var name = attributes.name;
            if (!(name in model.fields) || name == this.screen.exclude_field) {
                container.add(attributes);
                return;
            }
            if (!attributes.widget) {
                attributes.widget = model.fields[name]
                    .description.type;
            }
            var attribute_names = ['relation', 'domain', 'selection',
                'relation_field', 'string', 'views', 'add_remove', 'sort',
                'context', 'size', 'filename', 'autocomplete', 'translate',
                'create', 'delete'];
            for (var i in attribute_names) {
                var attr = attribute_names[i];
                if ((attr in model.fields[name].description) &&
                        (node.getAttribute(attr) === null)) {
                    attributes[attr] = model.fields[name]
                        .description[attr];
                }
            }
            var WidgetFactory = Sao.View.form_widget_get(
                    attributes.widget);
            if (!WidgetFactory) {
                container.add(attributes);
                return;
            }
            var widget = new WidgetFactory(name, model, attributes);
            widget.position = this.widget_id += 1;
            widget.view = this;
            // TODO expand, fill, help, height, width
            container.add(attributes, widget);
            if (this.widgets[name] === undefined) {
                this.widgets[name] = [];
            }
            this.widgets[name].push(widget);
            this.fields[name] = true;
        },
        _parse_group: function(model, node, container, attributes) {
            var group = new Sao.View.Form.Group(attributes);
            group.add(this.parse(model, node));
            this.state_widgets.push(group);
            container.add(attributes, group);
        },
        display: function() {
            var record = this.screen.current_record;
            var field;
            var name;
            var promesses = {};
            if (record) {
                // Force to set fields in record
                // Get first the lazy one to reduce number of requests
                var fields = [];
                for (name in record.model.fields) {
                    field = record.model.fields[name];
                    fields.push([name, field.description.loading || 'eager']);
                }
                fields.sort(function(a, b) {
                    return a[1].localeCompare(b[1]);
                });
                fields.forEach(function(e) {
                    var name = e[0];
                    promesses[name] = record.load(name);
                });
            }
            var set_state = function(record, field, name) {
                var prm = jQuery.when();
                if (name in promesses) {
                    prm = promesses[name];
                }
                prm.done(function() {
                    field.set_state(record);
                });
            };
            var display = function(record, field, name) {
                return function(widget) {
                    var prm = jQuery.when();
                    if (name in promesses) {
                        prm = promesses[name];
                    }
                    prm.done(function() {
                        widget.display(record, field);
                    });
                };
            };
            for (name in this.widgets) {
                var widgets = this.widgets[name];
                field = null;
                if (record) {
                    field = record.model.fields[name];
                }
                if (field) {
                    set_state(record, field, name);
                }
                widgets.forEach(display(record, field, name));
            }
            jQuery.when.apply(jQuery,
                    jQuery.map(promesses, function(p) {
                        return p;
                    })
                ).done(function() {
                    var j;
                    for (j in this.state_widgets) {
                        var state_widget = this.state_widgets[j];
                        state_widget.set_state(record);
                    }
                    for (j in this.containers) {
                        var container = this.containers[j];
                        container.resize();
                    }
                }.bind(this));
        },
        set_value: function() {
            var record = this.screen.current_record;
            if (record) {
                var set_value = function(widget) {
                    widget.set_value(record, this);
                };
                for (var name in this.widgets) {
                    if (name in record.model.fields) {
                        var widgets = this.widgets[name];
                        var field = record.model.fields[name];
                        widgets.forEach(set_value, field);
                    }
                }
            }
        },
        button_clicked: function(event) {
            var button = event.data;
            var record = this.screen.current_record;
            var fields = Object.keys(this.fields);
            record.validate(fields).then(function(validate) {
                if (!validate) {
                    this.screen.display();
                    return;
                } else {
                    this.screen.button(button.attributes);
                }
            }.bind(this));
        },
        selected_records: function() {
            if (this.screen.current_record) {
                return [this.screen.current_record];
            }
            return [];
        }
    });

    Sao.View.Form.Container = Sao.class_(Object, {
        init: function(col) {
            if (col === undefined) col = 4;
            this.col = col;
            this.el = jQuery('<table/>', {
                'class': 'form-container'
            });
            this.add_row();
        },
        add_row: function() {
            this.el.append(jQuery('<tr/>'));
        },
        rows: function() {
            return this.el.children().children('tr');
        },
        row: function() {
            return this.rows().last();
        },
        add: function(attributes, widget) {
            var colspan = attributes.colspan;
            if (colspan === undefined) colspan = 1;
            var xfill = attributes.xfill;
            if (xfill === undefined) xfill = 1;
            var xexpand = attributes.xexpand;
            if (xexpand === undefined) xexpand = 1;
            var len = 0;
            var row = this.row();
            row.children().map(function(i, e) {
                len += Number(jQuery(e).attr('colspan') || 1);
            });
            if (len + colspan > this.col) {
                this.add_row();
                row = this.row();
            }
            var el;
            if (widget) {
                el = widget.el;
            }
            var cell = jQuery('<td/>', {
                'colspan': colspan,
                'class': widget ? widget.class_ || '' : ''
            }).append(el);
            if (xexpand) {
                cell.addClass('xexpand');
                cell.css('width', '100%');
            }
            if (xfill) {
                cell.addClass('xfill');
                if (xexpand && el) {
                    el.css('width', '100%');
                }
            }
            row.append(cell);
        },
        resize: function() {
            var rows = this.rows().toArray();
            var widths = [];
            var col = this.col;
            var has_expand = false;
            var i, j;
            var get_xexpands = function(row) {
                row = jQuery(row);
                var xexpands = [];
                i = 0;
                row.children().map(function() {
                    var cell = jQuery(this);
                    var colspan = Math.min(Number(cell.attr('colspan')), col);
                    if (cell.hasClass('xexpand') &&
                        (!jQuery.isEmptyObject(cell.children())) &&
                        (cell.children().css('display') != 'none')) {
                        xexpands.push([cell, i]);
                    }
                    i += colspan;
                });
                return xexpands;
            };
            // Sort rows to compute first the most constraining row
            // which are the one with the more xexpand cells
            // and with the less colspan
            rows.sort(function(a, b) {
                a = get_xexpands(a);
                b = get_xexpands(b);
                if (a.length == b.length) {
                    var reduce = function(previous, current) {
                        var cell = current[0];
                        var colspan = Math.min(
                            Number(cell.attr('colspan')), col);
                        return previous + colspan;
                    };
                    return a.reduce(reduce, 0) - b.reduce(reduce, 0);
                } else {
                    return b.length - a.length;
                }
            });
            rows.forEach(function(row) {
                row = jQuery(row);
                var xexpands = get_xexpands(row);
                var width = 100 / xexpands.length;
                xexpands.forEach(function(e) {
                    var cell = e[0];
                    i = e[1];
                    var colspan = Math.min(Number(cell.attr('colspan')), col);
                    var current_width = 0;
                    for (j = 0; j < colspan; j++) {
                        current_width += widths[i + j] || 0;
                    }
                    for (j = 0; j < colspan; j++) {
                        if (!current_width) {
                            widths[i + j] = width / colspan;
                        } else if (current_width > width) {
                            // Split proprotionally the difference over all cells
                            // following their current width
                            var diff = current_width - width;
                            if (widths[i + j]) {
                                widths[i + j] -= (diff /
                                    (current_width / widths[i + j]));
                            }
                        }
                    }
                });
                if (!jQuery.isEmptyObject(xexpands)) {
                    has_expand = true;
                }
            });
            rows.forEach(function(row) {
                row = jQuery(row);
                i = 0;
                row.children().map(function() {
                    var cell = jQuery(this);
                    var colspan = Math.min(Number(cell.attr('colspan')), col);
                    if (cell.hasClass('xexpand') &&
                        (cell.children().css('display') != 'none')) {
                        var width = 0;
                        for (j = 0; j < colspan; j++) {
                            width += widths[i + j] || 0;
                        }
                        cell.css('width', width + '%');
                    }
                    if (cell.children().css('display') == 'none') {
                        cell.hide();
                    } else {
                        cell.show();
                    }
                    i += colspan;
                });
            });
            if (has_expand) {
                this.el.css('width', '100%');
            } else {
                this.el.css('width', '');
            }
        }
    });

    var StateWidget = Sao.class_(Object, {
        init: function(attributes) {
            this.attributes = attributes;
        },
        set_state: function(record) {
            var state_changes;
            if (record) {
                state_changes = record.expr_eval(this.attributes.states || {});
            } else {
                state_changes = {};
            }
            var invisible = state_changes.invisible;
            if (invisible === undefined) {
                invisible = this.attributes.invisible;
            }
            if (invisible) {
                this.hide();
            } else {
                this.show();
            }
        },
        show: function() {
            this.el.show();
        },
        hide: function() {
            this.el.hide();
        }
    });

    Sao.View.Form.Separator = Sao.class_(StateWidget, {
        init: function(text, attributes) {
            Sao.View.Form.Separator._super.init.call(this, attributes);
            this.el = jQuery('<div/>', {
                'class': 'form-separator'
            });
            if (text) {
                this.el.append(jQuery('<p/>', {
                    'text': text
                }));
            }
            this.el.append(jQuery('<hr/>'));
        }
    });

    Sao.View.Form.Label = Sao.class_(StateWidget, {
        class_: 'form-label',
        init: function(text, attributes) {
            Sao.View.Form.Label._super.init.call(this, attributes);
            this.el = jQuery('<label/>', {
                text: text,
                'class': this.class_
            });
        },
        set_state: function(record) {
            Sao.View.Form.Label._super.set_state.call(this, record);
            if ((this.attributes.string === undefined) &&
                    this.attributes.name) {
                var text = '';
                if (record) {
                    text = record.field_get_client(this.attributes.name) || '';
                }
                this.el.val(text);
            }
        }
    });

    Sao.View.Form.Notebook = Sao.class_(StateWidget, {
        class_: 'form-notebook',
        init: function(attributes) {
            Sao.View.Form.Notebook._super.init.call(this, attributes);
            this.el = jQuery('<div/>', {
                'class': this.class_
            });
            this.el.append(jQuery('<ul/>'));
            this.el.tabs();
            this.selected = false;
            this.counter = 0;
        },
        add: function(tab, text) {
            var tab_id = '#tab-form-' + this.counter++;
            this.el.tabs('add', tab_id, text);
            this.el.children(tab_id).html(tab);
            if (!this.selected) {
                this.el.tabs('select', tab_id);
                this.selected = true;
            }
            return jQuery('> ul li', this.el).last();
        }
    });

    Sao.View.Form.Page = Sao.class_(StateWidget, {
        init: function(el, attributes) {
            Sao.View.Form.Page._super.init.call(this, attributes);
            this.el = el;
        }
    });

    Sao.View.Form.Group = Sao.class_(StateWidget, {
        class_: 'form-group',
        init: function(attributes) {
            Sao.View.Form.Group._super.init.call(this, attributes);
            this.el = jQuery('<div/>', {
                'class': this.class_
            });
        },
        add: function(widget) {
            this.el.append(widget.el);
        }
    });

    Sao.View.form_widget_get = function(type) {
        switch (type) {
            case 'char':
                return Sao.View.Form.Char;
            case 'sha':
                return Sao.View.Form.Sha;
            case 'date':
                return Sao.View.Form.Date;
            case 'datetime':
                return Sao.View.Form.DateTime;
            case 'integer':
            case 'biginteger':
                return Sao.View.Form.Integer;
            case 'float':
            case 'numeric':
                return Sao.View.Form.Float;
            case 'selection':
                return Sao.View.Form.Selection;
            case 'float_time':
                return Sao.View.Form.FloatTime;
            case 'boolean':
                return Sao.View.Form.Boolean;
            case 'text':
                return Sao.View.Form.Text;
            case 'many2one':
                return Sao.View.Form.Many2One;
            case 'reference':
                return Sao.View.Form.Reference;
            case 'one2many':
                return Sao.View.Form.One2Many;
            case 'many2many':
                return Sao.View.Form.Many2Many;
            case 'binary':
                return Sao.View.Form.Binary;
        }
    };


    Sao.View.Form.Widget = Sao.class_(Object, {
        init: function(field_name, model, attributes) {
            this.field_name = field_name;
            this.model = model;
            this.view = null;  // Filled later
            this.attributes = attributes;
            this.el = null;
            this.position = 0;
            this.visible = true;
        },
        display: function(record, field) {
            var readonly = this.attributes.readonly;
            var invisible = this.attributes.invisible;
            if (!field) {
                if (readonly === undefined) {
                    readonly = true;
                }
                if (invisible === undefined) {
                    invisible = false;
                }
                this.set_readonly(readonly);
                this.set_invisible(invisible);
                return;
            }
            var state_attrs = field.get_state_attrs(record);
            if (readonly === undefined) {
                readonly = state_attrs.readonly;
                if (readonly === undefined) {
                    readonly = false;
                }
            }
            this.set_readonly(readonly);
            var valid = true;
            if (state_attrs.valid !== undefined) {
                valid = state_attrs.valid;
            }
            // XXX allow to customize colors
            var color = 'inherit';
            if (readonly) {
            } else if (!valid) {
                color = 'red';
            } else if (state_attrs.required) {
                color = 'lightblue';
            }
            this.set_color(color);
            if (invisible === undefined) {
                invisible = field.get_state_attrs(record).invisible;
                if (invisible === undefined) {
                    invisible = false;
                }
            }
            this.set_invisible(invisible);
        },
        record: function() {
            if (this.view && this.view.screen) {
                return this.view.screen.current_record;
            }
        },
        field: function() {
            var record = this.record();
            if (record) {
                return record.model.fields[this.field_name];
            }
        },
        focus_out: function() {
            if (!this.field()) {
                return;
            }
            if (!this.visible) {
                return;
            }
            this.set_value(this.record(), this.field());
        },
        set_value: function(record, field) {
        },
        set_readonly: function(readonly) {
            this.el.prop('disabled', readonly);
        },
        _get_color_el: function() {
            return this.el;
        },
        set_color: function(color) {
            var el = this._get_color_el();
            el.css('background-color', color);
        },
        set_invisible: function(invisible) {
            this.visible = !invisible;
            if (invisible) {
                this.el.hide();
            } else {
                this.el.show();
            }
        }
    });

    Sao.View.Form.Char = Sao.class_(Sao.View.Form.Widget, {
        class_: 'form-char',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Char._super.init.call(this, field_name, model,
                attributes);
            this.el = jQuery('<input/>', {
                'type': 'input',
                'class': this.class_
            });
            this.el.change(this.focus_out.bind(this));
        },
        display: function(record, field) {
            Sao.View.Form.Char._super.display.call(this, record, field);
            if (record) {
                var value = record.field_get_client(this.field_name);
                this.el.val(value || '');
            } else {
                this.el.val('');
            }
        },
        set_value: function(record, field) {
            field.set_client(record, this.el.val());
        }
    });

    Sao.View.Form.Sha = Sao.class_(Sao.View.Form.Char, {
        class_: 'form-sha',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Sha._super.init.call(this, field_name, model,
                attributes);
            this.el.prop('type', 'password');
        }
    });

    Sao.View.Form.Date = Sao.class_(Sao.View.Form.Widget, {
        class_: 'form-date',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Date._super.init.call(this, field_name, model,
                attributes);
            this.el = jQuery('<div/>', {
                'class': this.class_
            });
            this.date = jQuery('<input/>', {
                'type': 'input'
            });
            this.el.append(jQuery('<div/>').append(this.date));
            this.date.datepicker({
                showOn: 'none'
            });
            this.date.change(this.focus_out.bind(this));
            this.button = jQuery('<button/>').button({
                'icons': {
                    'primary': 'ui-icon-calendar'
                },
                'text': false
            });
            this.el.prepend(this.button);
            this.button.click(function() {
                this.date.datepicker('show');
            }.bind(this));
        },
        _get_color_el: function() {
            return this.date;
        },
        get_format: function(record, field) {
            return Sao.common.date_format();
        },
        display: function(record, field) {
            if (record && field) {
                this.date.datepicker('option', 'dateFormat',
                        this.get_format(record, field));
            }
            Sao.View.Form.Date._super.display.call(this, record, field);
            if (record) {
                this.date.val(record.field_get_client(this.field_name));
            }
        },
        set_value: function(record, field) {
            field.set_client(record, this.date.val());
        }
    });

    Sao.View.Form.DateTime = Sao.class_(Sao.View.Form.Date, {
        init: function(field_name, model, attributes) {
            Sao.View.Form.DateTime._super.init.call(this, field_name, model,
                attributes);
            this.date.datepicker('option', 'beforeShow', function() {
                var time = ' ' + Sao.common.format_time(
                    this.field().time_format(this.record()),
                    this._get_time());
                this.date.datepicker('option', 'dateFormat',
                    Sao.common.date_format() + time);
                this.date.prop('disabled', true);
            }.bind(this));
            this.date.datepicker('option', 'onClose', function() {
                this.date.prop('disabled', false);
            }.bind(this));
        },
        _get_time: function() {
            return Sao.common.parse_datetime(Sao.common.date_format(),
                this.field().time_format(this.record()), this.date.val());
        },
        get_format: function(record, field) {
            var time = '';
            if (record) {
                var value = record.field_get(this.field_name);
                time = ' ' + Sao.common.format_time(field.time_format(record),
                    value);
            }
            return Sao.common.date_format() + time;
        }
    });

    Sao.View.Form.Time = Sao.class_(Sao.View.Form.Char, {
        class_: 'form-time'
    });

    Sao.View.Form.Integer = Sao.class_(Sao.View.Form.Char, {
        class_: 'form-integer',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Integer._super.init.call(this, field_name, model,
                attributes);
            this.el.css('text-align', 'right');
        },
        set_value: function(record, field) {
            field.set_client(record, this.el.val());
        }
    });

    Sao.View.Form.Float = Sao.class_(Sao.View.Form.Integer, {
        class_: 'form-float'
    });

    Sao.View.Form.Selection = Sao.class_(Sao.View.Form.Widget, {
        class_: 'form-selection',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Selection._super.init.call(this, field_name, model,
                attributes);
            this.el = jQuery('<select/>', {
                'class': this.class_
            });
            this.el.change(this.focus_out.bind(this));
            Sao.common.selection_mixin.init.call(this);
            this.init_selection();
        },
        init_selection: function(key) {
            Sao.common.selection_mixin.init_selection.call(this, key,
                this.set_selection.bind(this));
        },
        update_selection: function(record, field, callbak) {
            Sao.common.selection_mixin.update_selection.call(this, record,
                field, function(selection) {
                    this.set_selection(selection);
                    if (callbak) {
                        callbak();
                    }
                }.bind(this));
        },
        set_selection: function(selection) {
            var select = this.el;
            select.empty();
            selection.forEach(function(e) {
                select.append(jQuery('<option/>', {
                    'value': e[0],
                    'text': e[1]
                }));
            });
        },
        display: function(record, field) {
            Sao.View.Form.Selection._super.display.call(this, record, field);
            this.update_selection(record, field, function() {
                if (!field) {
                    this.el.val('');
                    return;
                }
                var value = field.get(record);
                var prm, found = false;
                for (var i = 0, len = this.selection.length; i < len; i++) {
                    if (this.selection[i][0] === value) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    prm = Sao.common.selection_mixin.get_inactive_selection
                        .call(this, value);
                    prm.done(function(inactive) {
                        this.el.append(jQuery('<option/>', {
                            value: inactive[0],
                            text: inactive[1],
                            disabled: true
                        }));
                    }.bind(this));
                } else {
                    prm = jQuery.when();
                }
                prm.done(function() {
                    if (value === null) {
                        value = '';
                    }
                    this.el.val('' + value);
                }.bind(this));
            }.bind(this));
        },
        value_get: function() {
            var val = this.el.val();
            if ('relation' in this.attributes) {
                if (val === '') {
                    return null;
                } else if (val === null) {
                    // The selected value is disabled
                    val = this.el.find(':selected').attr('value');
                }
                return parseInt(val, 10);
            }
            return val;
        },
        set_value: function(record, field) {
            var value = this.value_get();
            field.set_client(record, value);
        }
    });

    Sao.View.Form.FloatTime = Sao.class_(Sao.View.Form.Char, {
        class_: 'form-float-time',
        init: function(field_name, model, attributes) {
            Sao.View.Form.FloatTime._super.init.call(this, field_name, model,
                attributes);
            this.el.css('text-align', 'right');
            this.conv = null; // TODO
        },
        display: function(record, field) {
            Sao.View.Form.FloatTime._super.display.call(this, record, field);
            if (record) {
                var value = record.field_get_client(this.field_name);
                this.el.val(Sao.common.text_to_float_time(value, this.conv));
            } else {
                this.el.val('');
            }
        }
    });

    Sao.View.Form.Boolean = Sao.class_(Sao.View.Form.Widget, {
        class_: 'form-boolean',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Boolean._super.init.call(this, field_name, model,
                attributes);
            this.el = jQuery('<input/>', {
                'type': 'checkbox',
                'class': this.class_
            });
            this.el.change(this.focus_out.bind(this));
        },
        display: function(record, field) {
            Sao.View.Form.Boolean._super.display.call(this, record, field);
            if (record) {
                this.el.prop('checked', record.field_get(this.field_name));
            } else {
                this.el.prop('checked', false);
            }
        },
        set_value: function(record, field) {
            var value = this.el.prop('checked');
            field.set_client(record, value);
        }
    });

    Sao.View.Form.Text = Sao.class_(Sao.View.Form.Widget, {
        class_: 'form-text',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Text._super.init.call(this, field_name, model,
                attributes);
            this.el = jQuery('<textarea/>', {
                'class': this.class_
            });
            this.el.change(this.focus_out.bind(this));
        },
        display: function(record, field) {
            Sao.View.Form.Text._super.display.call(this, record, field);
            if (record) {
                var value = record.field_get_client(this.field_name);
                this.el.val(value);
            } else {
                this.el.val('');
            }
        },
        set_value: function(record, field) {
            var value = this.el.val() || '';
            field.set_client(record, value);
        }
    });

    Sao.View.Form.Many2One = Sao.class_(Sao.View.Form.Widget, {
        class_: 'form-many2one',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Many2One._super.init.call(this, field_name, model,
                attributes);
            this.el = jQuery('<div/>', {
                'class': this.class_
            });
            this.entry = jQuery('<input/>', {
                'type': 'input'
            });
            this.entry.on('keyup', this.key_press.bind(this));
            this.el.append(jQuery('<div/>').append(this.entry));
            this.but_open = jQuery('<button/>').button({
                'icons': {
                    'primary': 'ui-icon-search'
                },
                'text': false
            });
            this.but_open.click(this.edit.bind(this));
            this.el.prepend(this.but_open);
            this.but_new = jQuery('<button/>').button({
                'icons': {
                    'primary': 'ui-icon-document'
                },
                'text': false
            });
            this.but_new.click(this.new_.bind(this));
            this.el.prepend(this.but_new);
            // TODO autocompletion
        },
        _get_color_el: function() {
            return this.entry;
        },
        get_screen: function() {
            var domain = this.field().get_domain(this.record());
            var context = this.field().get_context(this.record());
            return new Sao.Screen(this.get_model(), {
                'context': context,
                'domain': domain,
                'mode': ['form'],
                'view_ids': (this.attributes.view_ids || '').split(','),
                'views_preload': this.attributes.views
            });
        },
        set_text: function(value) {
            if (jQuery.isEmptyObject(value)) {
                value = '';
            }
            this.entry.val(value);
        },
        display: function(record, field) {
            var text_value, value;
            Sao.View.Form.Many2One._super.display.call(this, record, field);

            this._set_button_sensitive();

            if (!record) {
                this.entry.val('');
                return;
            }
            this.set_text(field.get_client(record));
            value = field.get(record);
            if (this.has_target(value)) {
                this.but_open.button({
                    'icons': {
                        'primary': 'ui-icon-folder-open'
                    }});
            } else {
                this.but_open.button({
                    'icons': {
                        'primary': 'ui-icon-search'
                    }});
            }
        },
        set_readonly: function(readonly) {
            this.entry.prop('disabled', readonly);
            this._set_button_sensitive();
        },
        _set_button_sensitive: function() {
            var model = this.get_model();
            var access = {
                create: true,
                read: true
            };
            if (model) {
                access = Sao.common.MODELACCESS.get(model);
            }
            var readonly = this.entry.prop('disabled');
            var create = this.attributes.create;
            if (create === undefined) {
                create = true;
            }
            this.but_new.prop('disabled', readonly || !create || !access.create);
            this.but_open.prop('disabled', !access.read);
        },
        id_from_value: function(value) {
            return value;
        },
        value_from_id: function(id, str) {
            if (str === undefined) {
                str = '';
            }
            return [id, str];
        },
        get_model: function() {
            return this.attributes.relation;
        },
        has_target: function(value) {
            return value !== undefined && value !== null;
        },
        edit: function(evt) {
            var model = this.get_model();
            if (!model || !Sao.common.MODELACCESS.get(model).read) {
                return;
            }
            var win;
            var record = this.record();
            var value = record.field_get(this.field_name);
            if (model && this.has_target(value)) {
                var screen = this.get_screen();
                var m2o_id =
                    this.id_from_value(record.field_get(this.field_name));
                screen.new_group([m2o_id]);
                var callback = function(result) {
                    if (result) {
                        var rec_name_prm = screen.current_record.rec_name();
                        rec_name_prm.done(function(name) {
                            var value = this.value_from_id(
                                screen.current_record.id, name);
                            this.record().field_set_client(this.field_name,
                                value, true);
                        }.bind(this));
                    }
                };
                win = new Sao.Window.Form(screen, callback.bind(this), {
                    save_current: true
                });
            } else if (model) {
                var dom;
                var domain = this.field().get_domain(record);
                var context = this.field().get_context(record);
                var text = this.entry.val();
                if (text) {
                    dom = [['rec_name', 'ilike', '%' + text + '%'], domain];
                } else {
                    dom = domain;
                }
                var sao_model = new Sao.Model(model);
                var ids_prm = sao_model.execute('search',
                        [dom, 0, Sao.config.limit, null], context);
                ids_prm.done(function(ids) {
                    if (ids.length == 1) {
                        this.record().field_set_client(this.field_name,
                            this.id_from_value(ids[0]), true);
                        return;
                    }
                    var callback = function(result) {
                        if (!jQuery.isEmptyObject(result)) {
                            var value = this.value_from_id(result[0][0],
                                result[0][1]);
                            this.record().field_set_client(this.field_name,
                                value, true);
                        }
                    };
                    win = new Sao.Window.Search(model,
                        callback.bind(this), {
                            sel_multi: false,
                            ids: ids,
                            context: context,
                            domain: domain,
                            view_ids: (this.attributes.view_ids ||
                                '').split(','),
                            views_preload: (this.attributes.views || {}),
                            new_: !this.but_new.prop('disabled')
                    });
                }.bind(this));
            }
        },
        new_: function(evt) {
            var model = this.get_model();
            if (!model || ! Sao.common.MODELACCESS.get(model).create) {
                return;
            }
            var screen = this.get_screen();
            var callback = function(result) {
                if (result) {
                    var rec_name_prm = screen.current_record.rec_name();
                    rec_name_prm.done(function(name) {
                        var value = this.value_from_id(
                            screen.current_record.id, name);
                        this.record().field_set_client(this.field_name, value);
                    }.bind(this));
                }
            };
            var win = new Sao.Window.Form(screen, callback.bind(this), {
                new_: true,
                save_current: true
            });
        },
        key_press: function(event_) {
            var editable = true; // TODO compute editable
            var activate_keys = [Sao.common.TAB_KEYCODE];
            var delete_keys = [Sao.common.BACKSPACE_KEYCODE,
                Sao.common.DELETE_KEYCODE];
            if (!this.wid_completion) {
                activate_keys.push(Sao.common.RETURN_KEYCODE);
            }

            if (event_.which == Sao.common.F3_KEYCODE && editable) {
                this.new_();
                event_.preventDefault();
            } else if (event_.which == Sao.common.F2_KEYCODE) {
                this.edit();
                event_.preventDefault();
            } else if (~activate_keys.indexOf(event_.which)) {
                this.activate();
            } else if (this.has_target(this.record().field_get(
                            this.field_name)) && editable) {
                var value = this.record().field_get_client(this.field_name);
                if ((value != this.entry.val()) ||
                        ~delete_keys.indexOf(event_.which)) {
                    this.entry.val('');
                    this.record().field_set_client(this.field_name,
                        this.value_from_id(null, ''));
                }
            }
        },
        activate: function() {
            var model = this.get_model();
            if (!model || !Sao.common.MODELACCESS.get(model).read) {
                return;
            }
            var record = this.record();
            var value = record.field_get(this.field_name);
            var sao_model = new Sao.Model(model);

            if (model && !this.has_target(value)) {
                var text = this.entry.val();
                if (!this._readonly && (text ||
                            this.field().get_state_attrs(this.record())
                            .required)) {
                    var dom;
                    var domain = this.field().get_domain(record);
                    var context = this.field().get_context(record);

                    if (text) {
                        dom = [['rec_name', 'ilike', '%' + text + '%'], domain];
                    } else {
                        dom = domain;
                    }
                    var ids_prm = sao_model.execute('search',
                            [dom, 0, Sao.config.limit, null], context);
                    ids_prm.done(function(ids) {
                        if (ids.length == 1) {
                            Sao.rpc({
                                'method': 'model.' + model + '.read',
                                'params': [[this.id_from_value(ids[0])],
                                ['rec_name'], context]
                            }, this.record().model.session
                            ).then(function(values) {
                                this.record().field_set_client(this.field_name,
                                    this.value_from_id(ids[0],
                                        values[0].rec_name), true);
                            }.bind(this));
                            return;
                        }
                        var callback = function(result) {
                            if (!jQuery.isEmptyObject(result)) {
                                var value = this.value_from_id(result[0][0],
                                    result[0][1]);
                                this.record().field_set_client(this.field_name,
                                    value, true);
                            } else {
                                this.entry.val('');
                            }
                        };
                        var win = new Sao.Window.Search(model,
                                callback.bind(this), {
                                    sel_multi: false,
                                    ids: ids,
                                    context: context,
                                    domain: domain,
                                    view_ids: (this.attributes.view_ids ||
                                        '').split(','),
                                    views_preload: (this.attributes.views ||
                                        {}),
                                    new_: false
                                    // TODO compute from but_new status
                                });
                    }.bind(this));
                }
            }
        }
    });

    Sao.View.Form.Reference = Sao.class_(Sao.View.Form.Many2One, {
        class_: 'form-reference',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Reference._super.init.call(this, field_name, model,
                attributes);
            this.select = jQuery('<select/>');
            this.el.prepend(jQuery('<span/>').text('-'));
            this.el.prepend(this.select);
            this.select.change(this.select_changed.bind(this));
            Sao.common.selection_mixin.init.call(this);
            this.init_selection();
        },
        init_selection: function(key) {
            Sao.common.selection_mixin.init_selection.call(this, key,
                this.set_selection.bind(this));
        },
        update_selection: function(record, field, callback) {
            Sao.common.selection_mixin.update_selection.call(this, record,
                field, function(selection) {
                    this.set_selection(selection);
                    if (callback) {
                        callback();
                    }
                }.bind(this));
        },
        set_selection: function(selection) {
            var select = this.select;
            select.empty();
            selection.forEach(function(e) {
                select.append(jQuery('<option/>', {
                    'value': e[0],
                    'text': e[1]
                }));
            });
        },
        id_from_value: function(value) {
            return parseInt(value.split(',')[1], 10);
        },
        value_from_id: function(id, str) {
            if (!str) {
                str = '';
            }
            return [this.get_model(), [id, str]];
        },
        get_model: function() {
            return this.select.val();
        },
        has_target: function(value) {
            if (value === null) {
                return false;
            }
            var model = value.split(',')[0];
            value = value.split(',')[1];
            if (jQuery.isEmptyObject(value)) {
                value = null;
            } else {
                value = parseInt(value, 10);
                if (isNaN(value)) {
                    value = null;
                }
            }
            return (model == this.get_model()) && (value >= 0);
        },
        _set_button_sensitive: function() {
            Sao.View.Form.Reference._super._set_button_sensitive.call(this);
            this.select.prop('disabled', this.entry.prop('disabled'));
        },
        select_changed: function() {
            this.entry.val('');
            var model = this.get_model();
            var value;
            if (model) {
                value = [model, [-1, '']];
            } else {
                value = ['', ''];
            }
            this.record().field_set_client(this.field_name, value);
        },
        set_value: function(record, field) {
            var value;
            if (!this.get_model()) {
                value = this.entry.val();
                if (jQuery.isEmptyObject(value)) {
                    field.set_client(record, this.field_name, null);
                } else {
                    field.set_client(record, this.field_name, ['', value]);
                }
            } else {
                value = field.get_client(record, this.field_name);
                var model, name;
                if (value instanceof Array) {
                    model = value[0];
                    name = value[1];
                } else {
                    model = '';
                    name = '';
                }
                if ((model != this.get_model()) ||
                        (name != this.entry.val())) {
                    field.set_client(record, this.field_name, null);
                    this.entry.val('');
                }
            }
        },
        set_text: function(value) {
            var model;
            if (value) {
                model = value[0];
                value = value[1];
            } else {
                model = null;
                value = null;
            }
            Sao.View.Form.Reference._super.set_text.call(this, value);
            if (model) {
                this.select.val(model);
            } else {
                this.select.val('');
            }
        },
        display: function(record, field) {
            this.update_selection(record, field, function() {
                Sao.View.Form.Reference._super.display.call(this, record, field);
            }.bind(this));
        }
    });

    Sao.View.Form.One2Many = Sao.class_(Sao.View.Form.Widget, {
        class_: 'form-one2many',
        init: function(field_name, model, attributes) {
            Sao.View.Form.One2Many._super.init.call(this, field_name, model,
                attributes);

            this._readonly = true;

            this.el = jQuery('<div/>', {
                'class': this.class_
            });
            this.menu = jQuery('<div/>', {
                'class': this.class_ + '-menu'
            });
            this.el.append(this.menu);

            var label = jQuery('<span/>', {
                'class': this.class_ + '-string',
                text: attributes.string
            });
            this.menu.append(label);

            var toolbar = jQuery('<span/>', {
                'class': this.class_ + '-toolbar'
            });
            this.menu.append(toolbar);

            if (attributes.add_remove) {
                this.wid_text = jQuery('<input/>', {
                    type: 'input'
                });
                // TODO add completion
                toolbar.append(this.wid_text);

                this.but_add = jQuery('<button/>').button({
                    icons: {
                        primary: 'ui-icon-plus'
                    },
                    label: 'Add',
                    text: false
                });
                this.but_add.click(this.add.bind(this));
                toolbar.append(this.but_add);

                this.but_remove = jQuery('<button/>').button({
                    icons: {
                        primary: 'ui-icon-minus'
                    },
                    label: 'Remove',
                    text: false
                });
                this.but_remove.click(this.remove.bind(this));
                toolbar.append(this.but_remove);
            }

            this.but_new = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-document'
                },
                label: 'New',
                text: false
            });
            this.but_new.click(this.new_.bind(this));
            toolbar.append(this.but_new);

            this.but_open = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-folder-open'
                },
                label: 'Open',
                text: false
            });
            this.but_open.click(this.open.bind(this));
            toolbar.append(this.but_open);

            this.but_del = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-trash'
                },
                label: 'Delete',
                text: false
            });
            this.but_del.click(this.delete_.bind(this));
            toolbar.append(this.but_del);

            this.but_undel = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-arrowreturn-1-s'
                },
                label: 'Undelete',
                text: false
            });
            this.but_undel.click(this.undelete.bind(this));
            toolbar.append(this.but_undel);

            this.but_previous = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-arrowthick-1-w'
                },
                label: 'Previous',
                text: false
            });
            this.but_previous.click(this.previous.bind(this));
            toolbar.append(this.but_previous);

            this.label = jQuery('<span/>', {
                'class': this.class_ + '-label'
            });
            this.label.text('(0, 0)');
            toolbar.append(this.label);

            this.but_next = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-arrowthick-1-e'
                },
                label: 'Next',
                text: false
            });
            this.but_next.click(this.next.bind(this));
            toolbar.append(this.but_next);

            this.but_switch = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-arrow-4-diag'
                },
                label: 'Switch',
                text: false
            });
            this.but_switch.click(this.switch_.bind(this));
            toolbar.append(this.but_switch);

            this.content = jQuery('<div/>', {
                'class': this.class_ + '-content'
            });
            this.el.append(this.content);

            var modes = (attributes.mode || 'tree,form').split(',');
            this.screen = new Sao.Screen(attributes.relation, {
                mode: modes,
                view_ids: (attributes.view_ids || '').split(','),
                views_preload: attributes.views || {},
                row_activate: this.activate.bind(this),
                exclude_field: attributes.relation_field || null
            });
            this.prm = this.screen.switch_view(modes[0]).done(function() {
                this.content.append(this.screen.screen_container.el);
            }.bind(this));
            // TODO sensitivity of buttons
        },
        _get_color_el: function() {
            if (this.screen.current_view &&
                    (this.screen.current_view.view_type == 'tree') &&
                    this.screen.current_view.el) {
                return this.screen.current_view.el;
            }
            return Sao.View.Form.One2Many._super._get_color_el.call(this);
        },
        set_readonly: function(readonly) {
            this._readonly = readonly;
            this._set_button_sensitive();
        },
        _set_button_sensitive: function() {
            var access = Sao.common.MODELACCESS.get(this.screen.model_name);
            var size_limit = false;
            if (this.record() && this.field()) {
                // TODO
            }
            var create = this.attributes.create;
            if (create === undefined) {
                create = true;
            }
            this.but_new.prop('disabled', this._readonly || !create ||
                    size_limit || !access.create);

            var delete_ = this.attributes['delete'];
            if (delete_ === undefined) {
                delete_ = true;
            }
            // TODO position
            this.but_del.prop('disabled', this._readonly || !delete_ ||
                    !access['delete']);
            this.but_undel.prop('disabled', this._readonly || size_limit);
            this.but_open.prop('disabled', !access.read);
            // TODO but_next, but_previous
            if (this.attributes.add_remove) {
                this.wid_text.prop('disabled', this._readonly);
                this.but_add.prop('disabled', this._readonly || size_limit ||
                        !access.write || !access.read);
                this.but_remove.prop('disabled', this._readonly ||
                        !access.write || !access.read);
            }
        },
        display: function(record, field) {
            Sao.View.Form.One2Many._super.display.call(this, record, field);

            this._set_button_sensitive();

            this.prm.done(function() {
                if (!record) {
                    return;
                }
                if (field === undefined) {
                    this.screen.new_group();
                    this.screen.set_current_record(null);
                    this.screen.parent = true;
                    this.screen.display();
                    return;
                }

                var new_group = record.field_get_client(this.field_name);
                if (new_group != this.screen.group) {
                    this.screen.set_group(new_group);
                    // TODO handle editable tree
                    // TODO set readonly, domain, size_limit
                }
                this.screen.display();
            }.bind(this));
        },
        activate: function(event_) {
            this.edit();
        },
        add: function(event_) {
            var access = Sao.common.MODELACCESS.get(this.screen.model_name);
            if (!access.write || !access.read) {
                return;
            }
            // TODO
        },
        remove: function(event_) {
            var access = Sao.common.MODELACCESS.get(this.screen.model_name);
            if (!access.write || !access.read) {
                return;
            }
            this.screen.remove(false, true, false);
        },
        new_: function(event_) {
            if (!Sao.common.MODELACCESS.get(this.screen.model_name).create) {
                return;
            }
            this.validate().done(function() {
                var context = jQuery.extend({},
                        this.field().get_context(this.record()));
                // TODO sequence
                if (this.screen.current_view.type == 'form' ||
                        this.screen.current_view.editable) {
                    this.screen.new_();
                    this.screen.current_view.el.prop('disabled', false);
                } else {
                    var record = this.record();
                    var field_size = record.expr_eval(
                        this.attributes.size) || -1;
                    field_size -= this.field().get_eval(record);
                    var win = new Sao.Window.Form(this.screen, function() {}, {
                        new_: true,
                        many: field_size,
                        context: context
                    });
                }
            }.bind(this));
        },
        open: function(event_) {
            this.edit();
        },
        delete_: function(event_) {
            if (!Sao.common.MODELACCESS.get(this.screen.model_name)['delete']) {
                return;
            }
            this.screen.remove(false, false, false);
        },
        undelete: function(event_) {
            this.screen.unremove();
        },
        previous: function(event_) {
            this.validate().done(function() {
                this.screen.display_previous();
            }.bind(this));
        },
        next: function(event_) {
            this.validate().done(function() {
                this.screen.display_next();
            }.bind(this));
        },
        switch_: function(event_) {
            this.screen.switch_view();
            // TODO color_set
        },
        edit: function() {
            if (!Sao.common.MODELACCESS.get(this.screen.model_name).read) {
                return;
            }
            this.validate().done(function() {
                var record = this.screen.current_record;
                if (record) {
                    var win = new Sao.Window.Form(this.screen, function() {});
                }
            }.bind(this));
        },
        validate: function() {
            var prm = jQuery.Deferred();
            this.view.set_value();
            var record = this.screen.current_record;
            if (record) {
                var fields = this.screen.current_view.get_fields();
                record.validate(fields).then(function(validate) {
                    if (!validate) {
                        this.screen.display();
                        prm.reject();
                    }
                    // TODO pre-validate
                    prm.resolve();
                }.bind(this));
            } else {
                prm.resolve();
            }
            return prm;
        },
        set_value: function(record, field) {
            this.screen.save_tree_state();
        }
    });

    Sao.View.Form.Many2Many = Sao.class_(Sao.View.Form.Widget, {
        class_: 'form-many2many',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Many2Many._super.init.call(this, field_name, model,
                attributes);

            this._readonly = true;

            this.el = jQuery('<div/>', {
                'class': this.class_
            });
            this.menu = jQuery('<div/>', {
                'class': this.class_ + '-menu'
            });
            this.el.append(this.menu);

            var label = jQuery('<span/>', {
                'class': this.class_ + '-string',
                text: attributes.string
            });
            this.menu.append(label);

            var toolbar = jQuery('<span/>', {
                'class': this.class_ + '-toolbar'
            });
            this.menu.append(toolbar);

            this.entry = jQuery('<input/>', {
                type: 'input'
            });
            this.entry.on('keyup', this.key_press.bind(this));
            toolbar.append(this.entry);

            // TODO completion

            this.but_add = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-plus'
                },
                label: 'Add',
                text: false
            });
            this.but_add.click(this.add.bind(this));
            toolbar.append(this.but_add);

            this.but_remove = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-minus'
                },
                label: 'Remove',
                text: false
            });
            this.but_remove.click(this.remove.bind(this));
            toolbar.append(this.but_remove);

            this.content = jQuery('<div/>', {
                'class': this.class_ + '-content'
            });
            this.el.append(this.content);

            this.screen = new Sao.Screen(attributes.relation, {
                mode: ['tree'],
                view_ids: (attributes.view_ids || '').split(','),
                views_preload: attributes.views || {},
                row_activate: this.activate.bind(this)
            });
            this.prm = this.screen.switch_view('tree').done(function() {
                this.content.append(this.screen.screen_container.el);
            }.bind(this));
        },
        _get_color_el: function() {
            if (this.screen.current_view &&
                    (this.screen.current_view.view_type == 'tree') &&
                    this.screen.current_view.el) {
                return this.screen.current_view.el;
            }
            return Sao.View.Form.Many2Many._super._get_color_el.call(this);
        },
        set_readonly: function(readonly) {
            this._readonly = readonly;
            this._set_button_sensitive();
        },
        _set_button_sensitive: function() {
            var size_limit = false;
            if (this.record() && this.field()) {
                // TODO
            }

            this.entry.prop('disabled', this._readonly);
            this.but_add.prop('disabled', this._readonly || size_limit);
            // TODO position
            this.but_remove.prop('disabled', this._readonly);
        },
        display: function(record, field) {
            Sao.View.Form.Many2Many._super.display.call(this, record, field);

            this.prm.done(function() {
                if (!record) {
                    return;
                }
                if (field === undefined) {
                    this.screen.new_group();
                    this.screen.set_current_record(null);
                    this.screen.parent = true;
                    this.screen.display();
                    return;
                }
                var new_group = record.field_get_client(this.field_name);
                if (new_group != this.screen.group) {
                    this.screen.set_group(new_group);
                }
                this.screen.display();
            }.bind(this));
        },
        activate: function() {
            this.edit();
        },
        add: function() {
            var dom;
            var domain = this.field().get_domain(this.record());
            var context = this.field().get_context(this.record());
            var value = this.entry.val();
            if (value) {
                dom = [['rec_name', 'ilike', '%' + value + '%']].concat(domain);
            } else {
                dom = domain;
            }

            var callback = function(result) {
                if (!jQuery.isEmptyObject(result)) {
                    var ids = [];
                    var i, len;
                    for (i = 0, len = result.length; i < len; i++) {
                        ids.push(result[i][0]);
                    }
                    this.screen.group.load(ids, true);
                    this.screen.display();
                }
                this.entry.val('');
            }.bind(this);
            var model = new Sao.Model(this.attributes.relation);
            var ids_prm = model.execute('search',
                    [dom, 0, Sao.config.limit, null], context);
            ids_prm.done(function(ids) {
               if (ids.length != 1) {
                   var win = new Sao.Window.Search(this.attributes.relation,
                       callback, {
                           sel_multi: true,
                           ids: ids,
                           context: context,
                           domain: domain,
                           view_ids: (this.attributes.view_ids ||
                               '').split(','),
                           views_preload: this.attributes.views || {},
                           new_: this.attributes.create
                   });
               } else {
                   callback([[ids[0], null]]);
               }
            }.bind(this));
        },
        remove: function() {
            this.screen.remove(false, true, false);
        },
        key_press: function(event_) {
            var editable = true; // TODO compute editable
            var activate_keys = [Sao.common.TAB_KEYCODE];
            if (!this.wid_completion) {
                activate_keys.push(Sao.common.RETURN_KEYCODE);
            }

            if (event_.which == Sao.common.F3_KEYCODE) {
                this.add();
                event_.preventDefault();
            } else if (~activate_keys.indexOf(event_.which) && editable) {
                if (this.entry.val()) {
                    this.add();
                }

            }
        },
        edit: function() {
            if (this.screen.current_record) {
                var callback = function(result) {
                    if (result) {
                        this.screen.current_record.save().done(function() {
                            this.screen.display();
                        }.bind(this));
                    } else {
                        this.screen.current_record.cancel();
                    }
                };
                var win = new Sao.Window.Form(this.screen,
                        callback.bind(this));
            }
        }
    });

    Sao.View.Form.Binary = Sao.class_(Sao.View.Form.Widget, {
        class_: 'form-binary',
        blob_url: '',
        init: function(field_name, model, attributes) {
            Sao.View.Form.Binary._super.init.call(this, field_name, model,
                attributes);
            this.filename = attributes.filename || null;

            this.el = jQuery('<div/>', {
                'class': this.class_
            });

            var inputs = jQuery('<div/>');
            this.el.append(inputs);
            if (this.filename && attributes.filename_visible) {
                this.text = jQuery('<input/>', {
                    type: 'input'
                });
                this.text.change(this.focus_out.bind(this));
                this.text.on('keyup', this.key_press.bind(this));
                inputs.append(this.text);
            }
            this.size = jQuery('<input/>', {
                type: 'input'
            });
            inputs.append(this.size);

            this.but_new = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-document'
                },
                text: false
            });
            this.but_new.click(this.new_.bind(this));
            this.el.prepend(this.but_new);

            if (this.filename) {
                this.but_open = jQuery('<a/>').button({
                    icons: {
                        primary: 'ui-icon-folder-open'
                    },
                    text: false
                });
                this.but_open.click(this.open.bind(this));
                this.el.prepend(this.but_open);
            }

            this.but_save_as = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-disk'
                },
                text: false
            });
            this.but_save_as.click(this.save_as.bind(this));
            this.el.prepend(this.but_save_as);

            this.but_remove = jQuery('<button/>').button({
                icons: {
                    primary: 'ui-icon-trash'
                },
                text: false
            });
            this.but_remove.click(this.remove.bind(this));
            this.el.prepend(this.but_remove);
        },
        filename_field: function() {
            var record = this.record();
            if (record) {
                return record.model.fields[this.filename];
            }
        },
        display: function(record, field) {
            Sao.View.Form.Binary._super.display.call(this, record, field);
            if (!field) {
                this.size.val('');
                if (this.filename) {
                    this.but_open.button('disable');
                }
                if (this.text) {
                    this.text.val('');
                }
                this.but_save_as.button('disable');
                return;
            }
            var size = field.get_size(record);
            var button_sensitive;
            if (size) {
                button_sensitive = 'enable';
            } else {
                button_sensitive = 'disable';
            }

            if (this.filename) {
                if (this.text) {
                    this.text.val(this.filename_field().get(record) || '');
                }
                this.but_open.button(button_sensitive);
            }
            this.size.val(Sao.common.humanize(size));
            this.but_save_as.button(button_sensitive);
        },
        save_as: function(evt) {
            var field = this.field();
            var record = this.record();
            field.get_data(record).done(function(data) {
                var blob = new Blob([data[0].binary],
                        {type: 'application/octet-binary'});
                var blob_url = window.URL.createObjectURL(blob);
                if (this.blob_url) {
                    window.URL.revokeObjectURL(this.blob_url);
                }
                this.blob_url = blob_url;
                window.open(blob_url);
            }.bind(this));
        },
        open: function(evt) {
            // TODO find a way to make the difference between downloading and
            // opening
            this.save_as(evt);
        },
        new_: function(evt) {
            var record = this.record();
            var file_dialog = jQuery('<div/>', {
                'class': 'file-dialog'
            });
            var file_selector = jQuery('<input/>', {
                type: 'file'
            });
            file_dialog.append(file_selector);
            var save_file = function() {
                var reader = new FileReader();
                reader.onload = function(evt) {
                    var uint_array = new Uint8Array(reader.result);
                    this.field().set_client(record, uint_array);
                }.bind(this);
                reader.onloadend = function(evt) {
                    file_dialog.dialog('close');
                };
                var file = file_selector[0].files[0];
                reader.readAsArrayBuffer(file);
                if (this.filename) {
                    this.filename_field().set_client(record, file.name);
                }
            };
            file_dialog.dialog({
                modal: true,
                title: 'Select a file', // TODO translation
                buttons: {
                    Cancel: function() {
                        $(this).dialog('close');
                    },
                    OK: save_file.bind(this)
                }
            });
            file_dialog.dialog('open');
        },
        remove: function(evt) {
            this.field().set_client(this.record(), null);
        },
        key_press: function(evt) {
            var editable = true; // TODO compute editable
            if (evt.which == Sao.common.F3_KEYCODE && editable) {
                this.new_();
                evt.preventDefault();
            } else if (evt.which == Sao.common.F2_KEYCODE) {
                this.open();
                evt.preventDefault();
            }
        },
        set_value: function(record, field) {
            if (this.text) {
                this.filename_field().set_client(record,
                        this.text.val() || '');
            }
        },
        _get_color_el: function() {
            if (this.text) {
                return this.text;
            } else {
                return this.size;
            }
        },
        set_readonly: function(readonly) {
            if (readonly) {
                this.but_new.hide();
                this.but_remove.hide();

            } else {
                this.but_new.show();
                this.but_remove.show();
            }
        }
    });
}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.Action = {
        report_blob_url: undefined
    };

    Sao.Action.exec_action = function(action, data, context) {
        if (context === undefined) {
            context = {};
        }
        if (data === undefined) {
            data = {};
        } else {
            data = jQuery.extend({}, data);
        }
        var params = {};
        switch (action.type) {
            case 'ir.action.act_window':
                params.view_ids = false;
                params.view_mode = null;
                if (!jQuery.isEmptyObject(action.views)) {
                    params.view_ids = [];
                    params.view_mode = [];
                    action.views.forEach(function(x) {
                        params.view_ids.push(x[0]);
                        params.view_mode.push(x[1]);
                    });
                } else if (!jQuery.isEmptyObject(action.view_id)) {
                    params.view_ids = [action.view_id[0]];
                }

                if (action.pyson_domain === undefined) {
                    action.pyson_domain = '[]';
                }
                var ctx = {
                    active_model: data.res_model,
                    active_id: data.id || false,
                    active_ids: data.ids
                };
                var session = Sao.Session.current_session;
                ctx = jQuery.extend(ctx, session.context);
                var eval_ctx = jQuery.extend({}, ctx);
                eval_ctx._user = session.user_id;
                params.context = new Sao.PYSON.Decoder(eval_ctx).decode(
                        action.pyson_context || '{}');
                ctx = jQuery.extend(ctx, params.context);
                ctx = jQuery.extend(ctx, context);

                var domain_context = jQuery.extend({}, ctx);
                domain_context.context = ctx;
                domain_context._user = session.user_id;
                params.domain = new Sao.PYSON.Decoder(domain_context).decode(
                        action.pyson_domain);

                var search_context = jQuery.extend({}, ctx);
                search_context.context = ctx;
                search_context._user = session.user_id;
                params.search_value = new Sao.PYSON.Decoder(search_context)
                    .decode(action.pyson_search_value || '[]');

                var tab_domain_context = jQuery.extend({}, ctx);
                tab_domain_context.context = ctx;
                tab_domain_context._user = session.user_id;
                var decoder = new Sao.PYSON.Decoder(tab_domain_context);
                params.tab_domain = [];
                action.domains.forEach(function(element, index) {
                    params.tab_domain.push(
                        [element[0], decoder.decode(element[1])]);
                });
                params.name = false;
                if (action.window_name) {
                    params.name = action.name;
                }
                params.model = action.res_model || data.res_model;
                params.res_id = action.res_id || data.res_id;
                params.limit = action.limit;
                params.auto_refresh = action.auto_refresh;
                params.icon = action['icon.rec_name'] || '';
                Sao.Tab.create(params);
                return;
            case 'ir.action.wizard':
                params.action = action.wiz_name;
                params.data = data;
                params.name = action.name;
                params.context = context;
                params.window = action.window;
                Sao.Wizard.create(params);
                return;
            case 'ir.action.report':
                params.name = action.report_name;
                params.data = data;
                params.direct_print = action.direct_print;
                params.email_print = action.email_print;
                params.email = action.email;
                params.context = context;
                Sao.Action.exec_report(params);
                return;
            case 'ir.action.url':
                window.open(action.url, '_blank');
                return;
        }
    };

    Sao.Action.exec_keyword = function(keyword, data, context, warning,
            alwaysask)
    {
        if (warning === undefined) {
            warning = true;
        }
        if (alwaysask === undefined) {
            alwaysask = false;
        }
        var actions = [];
        var model_id = data.id;
        var args = {
            'method': 'model.' + 'ir.action.keyword.get_keyword',
            'params': [keyword, [data.model, model_id], {}]
        };
        var prm = Sao.rpc(args, Sao.Session.current_session);
        var exec_action = function(actions) {
            var keyact = {};
            for (var i in actions) {
                var action = actions[i];
                keyact[action.name.replace(/_/g, '')] = action;
            }
            // TODO translation
            var prm = Sao.common.selection('Select your action', keyact,
                    alwaysask);
            return prm.then(function(action) {
                Sao.Action.exec_action(action, data, context);
            }, function() {
                if (jQuery.isEmptyObject(keyact) && warning) {
                    // TODO translation
                    alert('No action defined!');
                }
            });
        };
        return prm.pipe(exec_action);
    };

    Sao.Action.exec_report = function(attributes) {
        if (!attributes.context) {
            attributes.context = {};
        }
        if (!attributes.email) {
            attributes.email = {};
        }
        var data = jQuery.extend({}, attributes.data);
        var context = jQuery.extend({}, Sao.Session.current_session.context);
        jQuery.extend(context, attributes.context);
        context.direct_print = attributes.direct_print;
        context.email_print = attributes.email_print;
        context.email = attributes.email;

        var prm = Sao.rpc({
            'method': 'report.' + attributes.name + '.execute',
            'params': [data.ids || [], data, context]
        }, Sao.Session.current_session);
        prm.done(function(result) {
            var report_type = result[0];
            var data = result[1];
            var print = result[2];
            var name = result[3];

            // TODO direct print
            var blob = new Blob([data],
                {type: Sao.common.guess_mimetype(report_type)});
            var blob_url = window.URL.createObjectURL(blob);
            if (Sao.Action.report_blob_url) {
                window.URL.revokeObjectURL(Sao.Action.report_blob_url);
            }
            Sao.Action.report_blob_url = blob_url;
            window.open(blob_url);
        });
    };

    Sao.Action.execute = function(id, data, type, context) {
        if (!type) {
            Sao.rpc({
                'method': 'model.ir.action.read',
                'params': [[id], ['type'], context]
            }, Sao.Session.current_session).done(function(result) {
                Sao.Action.execute(id, data, result[0].type, context);
            });
        } else {
            Sao.rpc({
                'method': 'model.' + type + '.search_read',
                'params': [[['action', '=', id]], 0, 1, null, null, context]
            }, Sao.Session.current_session).done(function(result) {
                Sao.Action.exec_action(result[0], data);
            });
        }
    };

    Sao.Action.evaluate = function(action, atype, record) {
        action = jQuery.extend({}, action);
        switch (atype) {
            case 'print':
            case 'action':
                // TODO
                break;
            case 'relate':
                // TODO
                break;
            default:
                throw new Error('Action type ' + atype + ' is not supported');
        }
        return action;
    };
}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.common = {};

    Sao.common.BACKSPACE_KEYCODE = 8;
    Sao.common.TAB_KEYCODE = 9;
    Sao.common.RETURN_KEYCODE = 13;
    Sao.common.DELETE_KEYCODE = 46;
    Sao.common.F2_KEYCODE = 113;
    Sao.common.F3_KEYCODE = 114;

    Sao.common.SELECTION_NONE = 1;
    Sao.common.SELECTION_SINGLE = 2;  // Not implemented yet
    Sao.common.SELECTION_MULTIPLE = 3;

    Sao.common.compare = function(arr1, arr2) {
        if (arr1.length != arr2.length) {
            return false;
        }
        for (var i = 0; i < arr1.length; i++) {
            if (arr1[i] instanceof Array && arr2[i] instanceof Array) {
                if (!Sao.common.compare(arr1[i], arr2[i])) {
                    return false;
                }
            } else if (arr1[i] != arr2[i]) {
                return false;
            }
        }
        return true;
    };

    Sao.common.contains = function(array1, array2) {
        for (var i = 0; i < array1.length; i++) {
            if (Sao.common.compare(array1[i], array2)) {
                return true;
            }
        }
        return false;
    };

    // Find the intersection of two arrays.
    // The arrays must be sorted.
    Sao.common.intersect = function(a, b) {
        var ai = 0, bi = 0;
        var result = [];
        while (ai < a.length && bi < b.length) {
            if (a[ai] < b[bi]) {
                ai++;
            } else if (a[ai] > b[bi]) {
                bi++;
            } else {
                result.push(a[ai]);
                ai++;
                bi++;
            }
        }
        return result;
    };

    Sao.common.selection = function(title, values, alwaysask) {
        if (alwaysask === undefined) {
            alwaysask = false;
        }
        var prm = jQuery.Deferred();
        if ((Object.keys(values).length == 1) && (!alwaysask)) {
            var key = Object.keys(values)[0];
            prm.resolve(values[key]);
            return prm;
        }
        // TODO
        return prm.fail();
    };

    Sao.common.date_format = function() {
        if (Sao.Session.current_session) {
            var context = Sao.Session.current_session.context;
            if (context.locale && context.locale.date) {
                return context.locale.date
                    .replace('%d', 'dd')
                    .replace('%j', 'oo')
                    .replace('%a', 'D')
                    .replace('%A', 'DD')
                    .replace('%m', 'mm')
                    .replace('%b', 'M')
                    .replace('%B', 'MM')
                    .replace('%y', 'y')
                    .replace('%Y', 'yy');
            }
        }
        return jQuery.datepicker.W3C;
    };

    Sao.common.format_time = function(format, date) {
        var pad = Sao.common.pad;
        return format.replace('%H', pad(date.getHours(), 2))
            .replace('%M', pad(date.getMinutes(), 2))
            .replace('%S', pad(date.getSeconds(), 2));
    };

    Sao.common.parse_time = function(format, value) {
        if (jQuery.isEmptyObject(value)) {
            return null;
        }
        var getNumber = function(pattern) {
            var i = format.indexOf(pattern);
            if (~i) {
                var number = parseInt(value.slice(i, i + pattern.length), 10);
                if (!isNaN(number)) {
                    return number;
                }
            }
            return 0;
        };
        return new Sao.Time(getNumber('%H'), getNumber('%M'), getNumber('%S'));
    };

    Sao.common.format_datetime = function(date_format, time_format, date) {
        return (jQuery.datepicker.formatDate(date_format, date) + ' ' +
                Sao.common.format_time(time_format, date));
    };

    Sao.common.parse_datetime = function(date_format, time_format, value) {
        var date = Sao.DateTime(
                jQuery.datepicker.parseDate(date_format, value));
        var time_value = value.replace(jQuery.datepicker.formatDate(
                    date_format, date), '').trim();
        var time = Sao.common.parse_time(time_format, time_value);
        date.setHours(time.getHours());
        date.setMinutes(time.getMinutes());
        date.setSeconds(time.getSeconds());
        return date;
    };

    Sao.common.pad = function(number, length) {
        var str = '' + number;
        while (str.length < length) {
            str = '0' + str;
        }
        return str;
    };

    Sao.common.text_to_float_time = function(text, conversion, digit) {
        // TODO
        return text;
    };

    Sao.common.ModelAccess = Sao.class_(Object, {
        init: function() {
            this.batchnum = 100;
            this._access = {};
        },
        load_models: function(refresh) {
            var prm = jQuery.Deferred();
            if (!refresh) {
                this._access = {};
            }
            Sao.rpc({
                'method': 'model.ir.model.list_models',
                'params': [{}]
            }, Sao.Session.current_session).then(function(models) {
                var deferreds = [];
                var update_access = function(access) {
                    this._access = jQuery.extend(this._access, access);
                };
                for (var i = 0; i < models.length; i += this.batchnum) {
                    var to_load = models.slice(i, i + this.batchnum);
                    deferreds.push(Sao.rpc({
                        'method': 'model.ir.model.access.get_access',
                        'params': [to_load, {}]
                    }, Sao.Session.current_session)
                        .then(update_access.bind(this)));
                }
                jQuery.when.apply(jQuery, deferreds).then(
                    prm.resolve, prm.reject);
            }.bind(this));
            return prm;
        },
        get: function(model) {
            return this._access[model];
        }
    });
    Sao.common.MODELACCESS = new Sao.common.ModelAccess();

    Sao.common.humanize = function(size) {
        var sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        for (var i =0, len = sizes.length; i < len; i++) {
            if (size < 1000) {
                return size.toPrecision(4) + ' ' + sizes[i];
            }
            size /= 1000;
        }
    };

    Sao.common.EvalEnvironment = function(parent_, eval_type) {
        if (eval_type === undefined)
            eval_type = 'eval';
        var environment;
        if (eval_type == 'eval') {
            environment = parent_.get_eval();
        } else {
            environment = {};
            for (var key in parent_.model.fields) {
                var field = parent_.model.fields[key];
                environment[key] = field.get_on_change_value(parent_);
            }
        }
        environment.id = parent_.id;
        if (parent_.group.parent)
            Object.defineProperty(environment, '_parent_' +
                    parent_.group.parent_name, {
                'enumerable': true,
                'get': function() {
                    return Sao.common.EvalEnvironment(parent_.group.parent,
                        eval_type);
                }
            });
        environment.get = function(item, default_) {
            if (this.hasOwnProperty(item))
                return this[item];
            return default_;
        };

        return environment;
    };

    Sao.common.selection_mixin = {};
    Sao.common.selection_mixin.init = function() {
        this.selection = null;
        this.inactive_selection = [];
        this._last_domain = null;
        this._values2selection = {};
        this._domain_cache = {};
    };
    Sao.common.selection_mixin.init_selection = function(key, callback) {
        if (!key) {
            key = [];
            (this.attributes.selection_change_with || []).forEach(function(e) {
                key.push([e, null]);
            });
            key.sort();
        }
        var selection = this.attributes.selection || [];
        var prepare_selection = function(selection) {
            selection = jQuery.extend([], selection);
            if (this.attributes.sort === undefined || this.attributes.sort) {
                selection.sort(function(a, b) {
                    return a[1].localeCompare(b[1]);
                });
            }
            this.selection = jQuery.extend([], selection);
            if (callback) callback(this.selection);
        };
        if (!(selection instanceof Array) &&
                !(key in this._values2selection)) {
            var prm;
            if (key) {
                var params = {};
                key.forEach(function(e) {
                    params[e[0]] = e[1];
                });
                prm = this.model.execute(selection, [params]);
            } else {
                prm = this.model.execute(selection, []);
            }
            prm.pipe(prepare_selection.bind(this));
        } else {
            if (key in this._values2selection) {
                selection = this._values2selection.selection;
            }
            prepare_selection.call(this, selection);
        }
        this.inactive_selection = [];
    };
    Sao.common.selection_mixin.update_selection = function(record, field,
            callback) {
        if (!field) {
            if (callback) {
                callback(this.selection);
            }
            return;
        }
        if (!('relation' in this.attributes)) {
            var change_with = this.attributes.selection_change_with || [];
            var key = [];
            var args = record._get_on_change_args(change_with);
            for (var k in args) {
                key.push([k, args[k]]);
            }
            key.sort();
            Sao.common.selection_mixin.init_selection.call(this, key,
                    callback);
        } else {
            var domain = field.get_domain(record);
            var jdomain = JSON.stringify(domain);
            if (jdomain in this._domain_cache) {
                this.selection = this._domain_cache[jdomain];
                this._last_domain = domain;
            }
            if ((this._last_domain !== null) &&
                    Sao.common.compare(domain, this._last_domain)) {
                if (callback) {
                    callback(this.selection);
                }
                return;
            }
            var prm = Sao.rpc({
                'method': 'model.' + this.attributes.relation + '.search_read',
                'params': [domain, 0, null, null, ['rec_name'], {}]
            }, record.model.session);
            prm.done(function(result) {
                var selection = [];
                result.forEach(function(x) {
                    selection.push([x.id, x.rec_name]);
                });
                selection.push([null, '']);
                this._last_domain = domain;
                this._domain_cache[jdomain] = selection;
                this.selection = jQuery.extend([], selection);
                if (callback) {
                    callback(this.selection);
                }
            }.bind(this));
            prm.fail(function() {
                this._last_domain = null;
                this.selection = [];
                if (callback) {
                    callback(this.selection);
                }
            }.bind(this));
        }
    };
    Sao.common.selection_mixin.get_inactive_selection = function(value) {
        if (!this.attributes.relation) {
            return jQuery.when([]);
        }
        for (var i = 0, len = this.inactive_selection.length; i < len; i++) {
            if (value == this.inactive_selection[i][0]) {
                return jQuery.when(this.inactive_selection[i]);
            }
        }
        var prm = Sao.rpc({
            'method': 'model.' + this.attributes.relation + '.read',
            'params': [[value], ['rec_name'], {}]
        }, Sao.Session.current_session);
        return prm.then(function(result) {
            this.inactive_selection.push([result[0].id, result[0].rec_name]);
            return [result[0].id, result[0].rec_name];
        }.bind(this));
    };

    Sao.common.Button = Sao.class_(Object, {
        init: function(attributes) {
            this.attributes = attributes;
            this.el = jQuery('<button/>').button({
                text: true,
                label: attributes.string || '',
                icons: {primary: 'ui-icon-custom', secondary: null}
            });
            this.set_icon(attributes.icon);
        },
        set_icon: function(icon_name) {
            if (!icon_name) {
                return;
            }
            var prm = Sao.common.ICONFACTORY.register_icon(icon_name);
            prm.done(function(url) {
                this.el.children('.ui-button-icon-primary').css(
                    'background-image', 'url("' + url + '")');
            }.bind(this));
        },
        set_state: function(record) {
            var states;
            if (record) {
                states = record.expr_eval(this.attributes.states || {});
            } else {
                states = {};
            }
            if (states.invisible) {
                this.el.hide();
            } else {
                this.el.show();
            }
            this.el.prop('disabled', states.readonly);
            this.set_icon(states.icon || this.attributes.icon);
            if (record) {
                var parent = record.group.parent;
                while (parent) {
                    if (parent.has_changed()) {
                        this.el.prop('disabled', false);
                        break;
                    }
                    parent = parent.group.parent;
                }
            }
        }
    });

    Sao.common.udlex = Sao.class_(Object, {
        init: function(instream) {

            var Stream = Sao.class_(Object, {
                init: function(stream) {
                    this.stream = stream.split('');
                    this.i = 0;
                },
                read: function(length) {
                    if (length === undefined) {
                        length = 1;
                    }
                    if (this.i >= this.stream.length) {
                        return null;
                    }
                    var value = this.stream
                        .slice(this.i, this.i + length).join();
                    this.i += length;
                    return value;
                }
            });
            this.instream = new Stream(instream);
            this.eof = null;
            this.commenters = '';
            this.nowordchars = [':', '>', '<', '=', '!', '"', ';', '(', ')'];
            this.whitespace = ' \t\r\n';
            this.whitespace_split = false;
            this.quotes = '"';
            this.escape = '\\';
            this.escapedquotes = '"';
            this.state = ' ';
            this.pushback = [];
            this.token = '';
        },
        get_token: function() {
            if (this.pushback.length > 0) {
                return this.pushback.shift();
            }
            var raw = this.read_token();
            return raw;
        },
        read_token: function() {
            var quoted = false;
            var escapedstate = ' ';
            while (true) {
                var nextchar = this.instream.read(1);
                if (this.state === null) {
                    this.token = '';  // past en of file
                    break;
                } else if (this.state == ' ') {
                    if (!nextchar) {
                        this.state = null;  // end of file
                        break;
                    } else if (this.whitespace.contains(nextchar)) {
                        if (this.token || quoted) {
                            break;  // emit current token
                        } else {
                            continue;
                        }
                    } else if (this.commenters.contains(nextchar)) {
                        // TODO readline
                    } else if (this.escape.contains(nextchar)) {
                        escapedstate = 'a';
                        this.state = nextchar;
                    } else if (!~this.nowordchars.indexOf(nextchar)) {
                        this.token = nextchar;
                        this.state = 'a';
                    } else if (this.quotes.contains(nextchar)) {
                        this.state = nextchar;
                    } else if (this.whitespace_split) {
                        this.token = nextchar;
                        this.state = 'a';
                    } else {
                        this.token = nextchar;
                        if (this.token || quoted) {
                            break;  // emit current token
                        } else {
                            continue;
                        }
                    }
                } else if (this.quotes.contains(this.state)) {
                    quoted = true;
                    if (!nextchar) {  // end of file
                        throw 'no closing quotation';
                    }
                    if (nextchar == this.state) {
                        this.state = 'a';
                    } else if (this.escape.contains(nextchar) &&
                        this.escapedquotes.contains(this.state)) {
                        escapedstate = this.state;
                        this.state = nextchar;
                    } else {
                        this.token = this.token + nextchar;
                    }
                } else if (this.escape.contains(this.state)) {
                    if (!nextchar) {  // end of file
                        throw 'no escaped character';
                    }
                    if (this.quotes.contains(escapedstate) &&
                        (nextchar != this.state) &&
                        (nextchar != escapedstate)) {
                        this.token = this.token + this.state;
                    }
                    this.token = this.token + nextchar;
                    this.state = escapedstate;
                } else if (this.state == 'a') {
                    if (!nextchar) {
                        this.state = null;  // end of file
                        break;
                    } else if (this.whitespace.contains(nextchar)) {
                        this.state = ' ';
                        if (this.token || quoted) {
                            break;  // emit current token
                        } else {
                            continue;
                        }
                    } else if (this.commenters.contains(nextchar)) {
                        // TODO
                    } else if (this.quotes.contains(nextchar)) {
                        this.state = nextchar;
                    } else if (this.escape.contains(nextchar)) {
                        escapedstate = 'a';
                        this.state = nextchar;
                    } else if ((!~this.nowordchars.indexOf(nextchar)) ||
                            this.quotes.contains(nextchar) ||
                            this.whitespace_split) {
                        this.token = this.token + nextchar;
                    } else {
                        this.pushback.unshift(nextchar);
                        this.state = ' ';
                        if (this.token) {
                            break;  // emit current token
                        } else {
                            continue;
                        }
                    }
                }
            }
            var result = this.token;
            this.token = '';
            if (!quoted && result === '') {
                result = null;
            }
            return result;
        },
        next: function() {
            var token = this.get_token();
            if (token == this.eof) {
                return null;
            }
            return token;
        }
    });

    Sao.common.DomainParser = Sao.class_(Object, {
        OPERATORS: ['!=', '<=', '>=', '=', '!', '<', '>'],
        init: function(fields) {
            this.fields = {};
            this.strings = {};
            for (var name in fields) {
                var field = fields[name];
                if (field.searchable || (field.searchable === undefined)) {
                    this.fields[name] = field;
                    this.strings[field.string.toLowerCase()] = field;
                }
            }
        },
        parse: function(input) {
            try {
                var lex = new Sao.common.udlex(input);
                var tokens = [];
                while (true) {
                    var token = lex.next();
                    if (token === null) {
                        break;
                    }
                    tokens.push(token);
                }
                tokens = this.group_operator(tokens);
                tokens = this.parenthesize(tokens);
                tokens = this.group(tokens);
                tokens = this.operatorize(tokens, 'or');
                tokens = this.operatorize(tokens, 'and');
                tokens = this.parse_clause(tokens);
                return this.simplify(tokens);
            } catch (e) {
                if (e == 'no closing quotation') {
                    return this.parse(input + '"');
                }
                throw e;
            }
        },
        string: function(domain) {

            var string = function(clause) {
                if (jQuery.isEmptyObject(clause)) {
                    return '';
                }
                var escaped;
                if ((typeof clause[0] == 'string') &&
                        ((clause[0] in this.fields) ||
                         (clause[0] == 'rec_name'))) {
                    var name = clause[0];
                    var operator = clause[1];
                    var value = clause[2];
                    if (!(name in this.fields)) {
                        escaped = value.replace('%%', '__');
                        if (escaped.startsWith('%') && escaped.endsWith('%')) {
                            value = value.slice(1, -1);
                        }
                        return this.quote(value);
                    }
                    var field = this.fields[name];
                    if (operator.contains('ilike')) {
                        escaped = value.replace('%%', '__');
                        if (escaped.startsWith('%') && escaped.endsWith('%')) {
                            value = value.slice(1, -1);
                        } else if (!escaped.contains('%')) {
                            if (operator == 'ilike') {
                                operator = '=';
                            } else {
                                operator = '!';
                            }
                            value = value.replace('%%', '%');
                        }
                    }
                    var def_operator = this.default_operator(field);
                    if ((def_operator == operator.trim()) ||
                            (operator.contains(def_operator) &&
                             operator.contains('not'))) {
                        operator = operator.replace(def_operator, '')
                            .replace('not', '!').trim();
                    }
                    if (operator.endsWith('in')) {
                        if (operator == 'not in') {
                            operator = '!';
                        } else {
                            operator = '';
                        }
                    }
                    var formatted_value = this.format_value(field, value);
                    if (~this.OPERATORS.indexOf(operator) &&
                            ~['char', 'text', 'sha', 'selection']
                            .indexOf(field.type) &&
                            (value === '')) {
                        formatted_value = '""';
                    }
                    return (this.quote(field.string) + ': ' +
                            operator + formatted_value);
                } else {
                    return '(' + this.string(clause) + ')';
                }
            };
            string = string.bind(this);

            if (jQuery.isEmptyObject(domain)) {
                return '';
            }
            var nary = ' ';
            if ((domain[0] == 'AND') || (domain[0] == 'OR')) {
                if (domain[0] == 'OR') {
                    nary = ' or ';
                }
                domain = domain.slice(1);
            }
            return domain.map(string).join(nary);
        },
        group_operator: function(tokens) {
            var cur = tokens[0];
            var nex = null;
            var result = [];
            tokens.slice(1).forEach(function(nex) {
                if ((nex == '=') && cur &&
                    ~this.OPERATORS.indexOf(cur + nex)) {
                    result.push(cur + nex);
                    cur = null;
                } else {
                    if (cur !== null) {
                        result.push(cur);
                    }
                    cur = nex;
                }
            }.bind(this));
            if (cur !== null) {
                result.push(cur);
            }
            return result;
        },
        parenthesize: function(tokens) {
            var result = [];
            var current = result;
            var parent = [];
            tokens.forEach(function(token, i) {
                if (current === undefined) {
                    return;
                }
                if (token == '(') {
                    parent.push(current);
                    current = current[current.push([]) - 1];
                } else if (token == ')') {
                    current = parent.pop();
                } else {
                    current.push(token);
                }
            });
            return result;
        },
        group: function(tokens) {
            var result = [];

            var _group = function(parts) {
                var result = [];
                var push_result = function(part) {
                    result.push([part]);
                };
                var i = parts.indexOf(':');
                if (!~i) {
                    parts.forEach(push_result);
                    return result;
                }
                var sub_group = function(name, lvalue) {
                    return function(part) {
                        if (!jQuery.isEmptyObject(name)) {
                            if (!jQuery.isEmptyObject(lvalue)) {
                                if (part[0] !== null) {
                                    lvalue.push(part[0]);
                                }
                                result.push(name.concat([lvalue]));
                            } else {
                                result.push(name.concat(part));
                            }
                            name.splice(0, name.length);
                        } else {
                            result.push(part);
                        }
                    };
                };
                for (var j = 0; j < i; j++) {
                    var name = parts.slice(j, i).join(' ');
                    if (name.toLowerCase() in this.strings) {
                        if (!jQuery.isEmptyObject(parts.slice(0, j))) {
                            parts.slice(0, j).forEach(push_result);
                        } else {
                            push_result(null);
                        }
                        name = [name];
                        if (((i + 1) < parts.length) &&
                                (~this.OPERATORS.indexOf(parts[i + 1]))) {
                            name = name.concat([parts[i + 1]]);
                            i += 1;
                        } else {
                            name = name.concat([null]);
                        }
                        var lvalue = [];
                        while ((i + 2) < parts.length) {
                            if (parts[i + 2] == ';') {
                                lvalue.push(parts[i + 1]);
                                i += 2;
                            } else {
                                break;
                            }
                        }
                        _group(parts.slice(i + 1)).forEach(
                                sub_group(name, lvalue));
                        if (!jQuery.isEmptyObject(name)) {
                            if (!jQuery.isEmptyObject(lvalue)) {
                                result.push(name.concat([lvalue]));
                            } else {
                                result.push(name.concat([null]));
                            }
                        }
                        break;
                    }
                }
                return result;
            };
            _group = _group.bind(this);

            var parts = [];
            tokens.forEach(function(token) {
                if (token instanceof Array) {
                    _group(parts).forEach(function(group) {
                        if (!Sao.common.compare(group, [null])) {
                            result.push(group);
                        }
                    });
                    parts = [];
                    result.push(this.group(token));
                } else {
                    parts.push(token);
                }
            }.bind(this));
            _group(parts).forEach(function(group) {
                if (!Sao.common.compare(group, [null])) {
                    result.push(group);
                }
            });
            return result;
        },
        operatorize: function(tokens, operator) {
            var result = [];
            operator = operator || 'or';
            tokens = jQuery.extend([], tokens);
            var test = function(value) {
                if (value instanceof Array) {
                    return Sao.common.compare(value, [operator]);
                } else {
                    return value == operator;
                }
            };
            var cur = tokens.shift();
            while (test(cur)) {
                cur = tokens.shift();
            }
            if (cur === undefined) {
                return result;
            }
            if (cur instanceof Array) {
                cur = this.operatorize(cur, operator);
            }
            var nex = null;
            while (!jQuery.isEmptyObject(tokens)) {
                nex = tokens.shift();
                if ((nex instanceof Array) && !test(nex)) {
                    nex = this.operatorize(nex, operator);
                }
                if (test(nex)) {
                    nex = tokens.shift();
                    while (test(nex)) {
                        nex = tokens.shift();
                    }
                    if (nex instanceof Array) {
                        nex = this.operatorize(nex, operator);
                    }
                    if (nex !== undefined) {
                        cur = [operator.toUpperCase(), cur, nex];
                    } else {
                        if (!test(cur)) {
                            result.push([operator.toUpperCase(), cur]);
                            cur = null;
                        }
                    }
                    nex = null;
                } else {
                    if (!test(cur)) {
                        result.push(cur);
                    }
                    cur = nex;
                }
            }
            if (jQuery.isEmptyObject(tokens)) {
                if ((nex !== null) && !test(nex)) {
                    result.push(nex);
                } else if ((cur !== null) && !test(nex)) {
                    result.push(cur);
                }
            }
            return result;
        },
        parse_clause: function(tokens) {
            var result = [];
            tokens.forEach(function(clause) {
                if ((clause == 'OR') || (clause == 'AND')) {
                    result.push(clause);
                } else if ((clause.length == 1) &&
                    !(clause[0] instanceof Array)) {
                    result.push(['rec_name', 'ilike', this.likify(clause[0])]);
                } else if ((clause.length == 3) &&
                    (clause[0].toLowerCase() in this.strings)) {
                    var name = clause[0];
                    var operator = clause[1];
                    var value = clause[2];
                    var field = this.strings[clause[0].toLowerCase()];
                    if (operator === null) {
                        operator = this.default_operator(field);
                    }
                    if (value instanceof Array) {
                        if (operator == '!') {
                            operator = 'not in';
                        } else {
                            operator = 'in';
                        }
                    }
                    if (operator == '!') {
                        operator = this.negate_operator(
                                this.default_operator(field));
                    }
                    if (operator.contains('like')) {
                        value = this.likify(value);
                    }
                    if (~['integer', 'float', 'numeric', 'datetime', 'date',
                            'time'].indexOf(field.type)) {
                        if (value && value.contains('..')) {
                            var values = value.split('..', 2);
                            var lvalue = this.convert_value(field, values[0]);
                            var rvalue = this.convert_value(field, values[1]);
                            result.push([
                                    [field.name, '>=', lvalue],
                                    [field.name, '<', rvalue]
                                    ]);
                            return;
                        }
                    }
                    if (value instanceof Array) {
                        value = value.map(function(v) {
                            return this.convert_value(field, v);
                        }.bind(this));
                    } else {
                        value = this.convert_value(field, value);
                    }
                    result.push([field.name, operator, value]);
                } else {
                    result.push(this.parse_clause(clause));
                }
            }.bind(this));
            return result;
        },
        likify: function(value) {
            if (!value) {
                return '%';
            }
            var escaped = value.replace('%%', '__');
            if (escaped.contains('%')) {
                return value;
            } else {
                return '%' + value + '%';
            }
        },
        quote: function(value) {
            if (typeof value != 'string') {
                return value;
            }
            var tests = [':', ' ', '(', ')'].concat(this.OPERATORS);
            for (var i = 0; i < tests.length; i++) {
                var test = tests[i];
                if (value.contains(test)) {
                    return '"' + value + '"';
                }
            }
            return value;
        },
        default_operator: function(field) {
            if (~['char', 'text', 'many2one', 'many2many', 'one2many']
                    .indexOf(field.type)) {
                return 'ilike';
            } else {
                return '=';
            }
        },
        negate_operator: function(operator) {
            switch (operator) {
                case 'ilike':
                    return 'not ilike';
                case '=':
                    return '!=';
                case 'in':
                    return 'not in';
            }
        },
        time_format: function(field) {
            return new Sao.PYSON.Decoder({}).decode(field.format);
        },
        convert_value: function(field, value) {
            var convert_selection = function() {
                if (typeof value == 'string') {
                    for (var i = 0; i < field.selection.length; i++) {
                        var selection = field.selection[i];
                        var key = selection[0];
                        var text = selection[1];
                        if (value.toLowerCase() == text.toLowerCase()) {
                            return key;
                        }
                    }
                }
                return value;
            };

            var converts = {
                'boolean': function() {
                    if (typeof value == 'string') {
                        return ['y', 'yes', 'true', 't', '1'].some(
                                function(test) {
                                    return test.toLowerCase().startsWith(
                                        value.toLowerCase());
                                });
                    } else {
                        return Boolean(value);
                    }
                },
                'float': function() {
                    var result = Number(value);
                    if (isNaN(result) || value === '' || value === null) {
                        return null;
                    } else {
                        return result;
                    }
                },
                'integer': function() {
                    var result = parseInt(value, 10);
                    if (isNaN(result)) {
                        return null;
                    } else {
                        return result;
                    }
                },
                'numeric': function() {
                    var result = new Sao.Decimal(value);
                    if (isNaN(result.valueOf()) ||
                            value === '' || value === null) {
                        return null;
                    } else {
                        return result;
                    }
                },
                'selection': convert_selection,
                'reference': convert_selection,
                'datetime': function() {
                    try {
                        return Sao.common.parse_datetime(
                                Sao.common.date_format(),
                                this.time_format(field),
                                value);
                    } catch (e1) {
                        try {
                            return Sao.DateTime(jQuery.datepicker.parseDate(
                                        Sao.common.date_format(),
                                        value));
                        } catch (e2) {
                            return null;
                        }
                    }
                }.bind(this),
                'date': function() {
                    try {
                        return Sao.Date(jQuery.datepicker.parseDate(
                                    Sao.common.date_format(),
                                    value));
                    } catch (e) {
                        return null;
                    }
                },
                'time': function() {
                    try {
                        return Sao.common.parse_time(this.time_format(field),
                                value);
                    } catch (e) {
                        return null;
                    }
                }.bind(this),
                'many2one': function() {
                    if (value === '') {
                        return null;
                    } else {
                        return value;
                    }
                }
            };
            var func = converts[field.type];
            if (func) {
                return func();
            } else {
                return value;
            }
        },
        format_value: function(field, value) {
            var format_float = function() {
                if (!value && value !== 0 && value !== new Sao.Decimal(0)) {
                    return '';
                }
                var digit = String(value).split('.')[1];
                if (digit) {
                    digit = digit.length;
                } else {
                    digit = 0;
                }
                return value.toFixed(digit);
            };
            var format_selection = function() {
                for (var i = 0; i < field.selection.length; i++) {
                    if (field.selection[i][0] == value) {
                        return field.selection[i][1];
                    }
                }
                return value || '';
            };

            var converts = {
                'boolean': function() {
                    if (value) {
                        return 'True';  // TODO translate
                    } else {
                        return 'False';
                    }
                },
                'integer': function() {
                    if (value || value === 0) {
                        return '' + parseInt(value, 10);
                    } else {
                        return '';
                    }
                },
                'float': format_float,
                'numeric': format_float,
                'selection': format_selection,
                'reference': format_selection,
                'datetime': function() {
                    if (!value) {
                        return '';
                    }
                    if (value.isDate ||
                            !(value.getHours() ||
                             value.getMinutes() ||
                             value.getSeconds())) {
                        return jQuery.datepicker.formatDate(
                                Sao.common.date_format(),
                                value);
                    }
                    return Sao.common.format_datetime(
                            Sao.common.date_format(),
                            this.time_format(field),
                            value);
                }.bind(this),
                'date': function() {
                    if (!value) {
                        return '';
                    }
                    return jQuery.datepicker.formatDate(
                            Sao.common.date_format(),
                            value);
                },
                'time': function() {
                    if (!value) {
                        return '';
                    }
                    return Sao.common.format_time(
                            this.time_format(field),
                            value);
                }.bind(this),
                'many2one': function() {
                    if (value === null) {
                        return '';
                    } else {
                        return value;
                    }
                }
            };
            if (value instanceof Array) {
                return value.map(function(v) {
                    return this.format_value(field, v);
                }.bind(this)).join(';');
            } else {
                var func = converts[field.type];
                if (func) {
                    return this.quote(func(value));
                } else if (value === null) {
                    return '';
                } else {
                    return this.quote(value);
                }
            }
        },
        simplify: function(value) {
            if (value instanceof Array) {
                if ((value.length == 1) && (value[0] instanceof Array) &&
                        ((value[0][0] == 'AND') || (value[0][0] == 'OR') ||
                         (value[0][0] instanceof Array))) {
                    return this.simplify(value[0]);
                } else if ((value.length == 2) &&
                        ((value[0] == 'AND') || (value[0] == 'OR')) &&
                        (value[1] instanceof Array)) {
                    return this.simplify(value[1]);
                } else if ((value.length == 3) &&
                        ((value[0] == 'AND') || (value[0] == 'OR')) &&
                        (value[1] instanceof Array) &&
                        (value[0] == value[1][0])) {
                    value = this.simplify(value[1]).concat([value[2]]);
                }
                return value.map(this.simplify.bind(this));
            }
            return value;
        }
    });

    Sao.common.DomainInversion = Sao.class_(Object, {
        and: function(a, b) {return a && b;},
        or: function(a, b) {return a || b;},
        OPERATORS: {
            '=': function(a, b) {
                if ((a instanceof Array) && (b instanceof Array)) {
                    return Sao.common.compare(a, b);
                } else {
                    return (a === b);
                }
            },
            '>': function(a, b) {return (a > b);},
            '<': function(a, b) {return (a < b);},
            '<=': function(a, b) {return (a <= b);},
            '>=': function(a, b) {return (a >= b);},
            '!=': function(a, b) {
                if ((a instanceof Array) && (b instanceof Array)) {
                    return !Sao.common.compare(a, b);
                } else {
                    return (a !== b);
                }
            },
            'in': function(a, b) {
                return Sao.common.DomainInversion.in_(a, b);
            },
            'not in': function(a, b) {
                return !Sao.common.DomainInversion.in_(a, b);
            },
            // Those operators are not supported (yet ?)
            'like': function() {return true;},
            'ilike': function() {return true;},
            'not like': function() {return true;},
            'not ilike': function() {return true;},
            'child_of': function() {return true;},
            'not child_of': function() {return true;}
        },
        locale_part: function(expression, field_name) {
            if (expression === field_name) {
                return 'id';
            }
            if (expression.contains('.')) {
                return expression.split('.').slice(1).join('.');
            }
            return expression;
        },
        is_leaf: function(expression) {
            return ((expression instanceof Array) &&
                (expression.length > 2) &&
                (expression[1] in this.OPERATORS));
        },
        eval_leaf: function(part, context, boolop) {
            if (boolop === undefined) {
                boolop = this.and;
            }
            var field = part[0];
            var operand = part[1];
            var value = part[2];
            if (field.contains('.')) {
                // In the case where the leaf concerns a m2o then having a
                // value in the evaluation context is deemed suffisant
                return Boolean(context[field.split('.')[0]]);
            }
            if ((operand == '=') && !context[field] && (boolop === this.and)) {
                // We should consider that other domain inversion will set a
                // correct value to this field
                return true;
            }
            var context_field = context[field];
            if ((context_field instanceof Date) && !context_field) {
                // TODO set value to min
            }
            if ((value instanceof Date) && !context_field) {
                // TODO set context_field to min
            }
            if ((typeof context_field == 'string') &&
                    (value instanceof Array) && value.length == 2) {
                value = value.join(',');
            } else if ((context_field instanceof Array) &&
                    (typeof value == 'string') && context_field.length == 2) {
                context_field = context_field.join(',');
            }
            return this.OPERATORS[operand](context_field, value);
        },
        inverse_leaf: function(domain) {
            if (~['AND', 'OR'].indexOf(domain)) {
                return domain;
            } else if (this.is_leaf(domain)) {
                if (domain[1].contains('child_of')) {
                    if (domain.length == 3) {
                        return domain;
                    } else {
                        return [domain[3]].concat(domain.slice(1));
                    }
                }
                return domain;
            } else {
                return domain.map(this.inverse_leaf.bind(this));
            }
        },
        eval_domain: function(domain, context, boolop) {
            if (boolop === undefined) {
                boolop = this.and;
            }
            if (this.is_leaf(domain)) {
                return this.eval_leaf(domain, context, boolop);
            } else if (jQuery.isEmptyObject(domain) && boolop == this.and) {
                return true;
            } else if (jQuery.isEmptyObject(domain) && boolop == this.or) {
                return false;
            } else if (domain[0] == 'AND') {
                return this.eval_domain(domain.slice(1), context);
            } else if (domain[0] == 'OR') {
                return this.eval_domain(domain.slice(1), context, this.or);
            } else {
                return boolop(this.eval_domain(domain[0], context),
                        this.eval_domain(domain.slice(1), context, boolop));
            }
        },
        localize_domain: function(domain, field_name) {
            if (~['AND', 'OR', true, false].indexOf(domain)) {
                return domain;
            } else if (this.is_leaf(domain)) {
                if (domain[1].contains('child_of')) {
                    if (domain.length == 3) {
                        return domain;
                    } else {
                        return [domain[3]].concat(domain.slice(1, -1));
                    }
                }
                return [this.locale_part(domain[0], field_name)]
                    .concat(domain.slice(1));
            } else {
                return domain.map(function(e) {
                    return this.localize_domain(e, field_name);
                }.bind(this));
            }
        },
        unlocalize_domain: function(domain, fieldname) {
            if (~['AND', 'OR', true, false].indexOf(domain)) {
                return domain;
            } else if (this.is_leaf(domain)) {
                return [fieldname + '.' + domain[0]].concat(domain.slice(1));
            } else {
                return domain.map(function(e) {
                    return this.unlocalize_domain(e, fieldname);
                }.bind(this));
            }
        },
        simplify: function(domain) {
            if (this.is_leaf(domain)) {
                return domain;
            } else if (~['OR', 'AND'].indexOf(domain)) {
                return domain;
            } else if ((domain instanceof Array) && (domain.length == 1) &&
                    (!this.is_leaf(domain[0]))) {
                return this.simplify(domain[0]);
            } else if ((domain instanceof Array) && (domain.length == 2) &&
                    ~['AND', 'OR'].indexOf(domain[0])) {
                return [this.simplify(domain[1])];
            } else {
                return domain.map(this.simplify.bind(this));
            }
        },
        merge: function(domain, domoperator) {
            if (jQuery.isEmptyObject(domain) ||
                    ~['AND', 'OR'].indexOf(domain)) {
                return [];
            }
            var domain_type = domain[0] == 'OR' ? 'OR' : 'AND';
            if (this.is_leaf(domain)) {
                return [domain];
            } else if (domoperator === undefined) {
                return [domain_type].concat([].concat.apply([],
                        domain.map(function(e) {
                            return this.merge(e, domain_type);
                        }.bind(this))));
            } else if (domain_type == domoperator) {
                return [].concat.apply([], domain.map(function(e) {
                    return this.merge(e, domain_type);
                }.bind(this)));
            } else {
                // without setting the domoperator
                return [this.merge(domain)];
            }
        },
        parse: function(domain) {
            var And = Sao.common.DomainInversion.And;
            var Or = Sao.common.DomainInversion.Or;
            if (this.is_leaf(domain)) {
                return domain;
            } else if (jQuery.isEmptyObject(domain)) {
                return new And([]);
            } else if (domain[0] === 'OR') {
                return new Or(domain.slice(1));
            } else {
                var begin = 0;
                if (domain[0] === 'AND') {
                    begin = 1;
                }
                return new And(domain.slice(begin));
            }
        },
        domain_inversion: function(domain, symbol, context) {
            if (context === undefined) {
                context = {};
            }
            var expression = this.parse(domain);
            if (!~expression.variables.indexOf(symbol)) {
                return true;
            }
            return expression.inverse(symbol, context);
        }
    });
    Sao.common.DomainInversion.in_ = function(a, b) {
        if (a instanceof Array) {
            for (var i = 0, len = a.length; i < len; i++) {
                if (~b.indexOf(a[i])) {
                    return true;
                }
            }
            return false;
        } else {
            return Boolean(~b.indexOf(a));
        }
    };
    Sao.common.DomainInversion.And = Sao.class_(Object, {
        init: function(expressions) {
            this.domain_inversion = new Sao.common.DomainInversion();
            this.branches = expressions.map(this.domain_inversion.parse.bind(
                    this.domain_inversion));
            this.variables = [];
            for (var i = 0, len = this.branches.length; i < len; i++) {
                var expression = this.branches[i];
                if (this.domain_inversion.is_leaf(expression)) {
                    this.variables.push(this.base(expression[0]));
                } else if (expression instanceof
                    Sao.common.DomainInversion.And) {
                    this.variables = this.variables.concat(
                        expression.variables);
                }
            }
        },
        base: function(expression) {
            if (!expression.contains('.')) {
                return expression;
            } else {
                return expression.split('.')[0];
            }
        },
        inverse: function(symbol, context) {
            var DomainInversion = Sao.common.DomainInversion;
            var result = [];
            for (var i = 0, len = this.branches.length; i < len; i++) {
                var part = this.branches[i];
                if (part instanceof DomainInversion.And) {
                    var part_inversion = part.inverse(symbol, context);
                    var evaluated = typeof part_inversion == 'boolean';
                    if (!evaluated) {
                        result.push(part_inversion);
                    } else if (part_inversion) {
                        continue;
                    } else {
                        return false;
                    }
                } else if (this.domain_inversion.is_leaf(part) &&
                        (this.base(part[0]) === symbol)) {
                    result.push(part);
                } else {
                    var field = part[0];
                    if ((!(field in context)) ||
                            ((field in context) &&
                             this.domain_inversion.eval_leaf(part, context,
                                 this.domain_inversion.and))) {
                        result.push(true);
                    } else {
                        return false;
                    }
                }
            }
            result = result.filter(function(e) {
                return e !== true;
            });
            if (jQuery.isEmptyObject(result)) {
                return true;
            } else {
                return this.domain_inversion.simplify(result);
            }
        }
    });
    Sao.common.DomainInversion.Or = Sao.class_(Sao.common.DomainInversion.And, {
        inverse: function(symbol, context) {
            var DomainInversion = Sao.common.DomainInversion;
            var result = [];
            if (!~this.variables.indexOf(symbol) &&
                !jQuery.isEmptyObject(this.variables.filter(function(e) {
                    return !(e in context);
                }))) {
                // In this case we don't know anything about this OR part, we
                // consider it to be True (because people will have the
                // constraint on this part later).
                return true;
            }
            for (var i = 0, len = this.branches.length; i < len; i++) {
                var part = this.branches[i];
                if (part instanceof DomainInversion.And) {
                    var part_inversion = part.inverse(symbol, context);
                    var evaluated = typeof part_inversion == 'boolean';
                    if (!~this.variables.indexOf(symbol)) {
                        if (evaluated && part_inversion) {
                            return true;
                        }
                        continue;
                    }
                    if (!evaluated) {
                        result.push(part_inversion);
                    } else if (part_inversion) {
                        return true;
                    } else {
                        continue;
                    }
                } else if (this.domain_inversion.is_leaf(part) &&
                        (this.base(part[0]) == symbol)) {
                    result.push(part);
                } else {
                    var field = part[0];
                    field = this.base(field);
                    if ((field in context) &&
                            this.domain_inversion.eval_leaf(part, context,
                                this.domain_inversion.or)) {
                        return true;
                    } else if ((field in context) &&
                            !this.domain_inversion.eval_leaf(part, context,
                                this.domain_inversion.or)) {
                        result.push(false);
                    }
                }
            }
            result = result.filter(function(e) {
                return e !== false;
            });
            if (jQuery.isEmptyObject(result)) {
                return false;
            } else {
                return this.domain_inversion.simplify(['OR'].concat(result));
            }
        }
    });

    Sao.common.guess_mimetype = function(filename) {
        if (/.*odt$/.test(filename)) {
            return 'application/vnd.oasis.opendocument.text';
        } else if (/.*ods$/.test(filename)) {
            return 'application/vnd.oasis.opendocument.spreadsheet';
        } else if (/.*pdf$/.test(filename)) {
            return 'application/pdf';
        } else if (/.*docx$/.test(filename)) {
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } else if (/.*doc/.test(filename)) {
            return 'application/msword';
        } else if (/.*xlsx$/.test(filename)) {
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (/.*xls/.test(filename)) {
            return 'application/vnd.ms-excel';
        } else {
            return 'application/octet-binary';
        }
    };

    Sao.common.LOCAL_ICONS = [
        'tryton-attachment-hi',
        'tryton-attachment',
        'tryton-bookmark',
        'tryton-clear',
        'tryton-close',
        'tryton-connect',
        'tryton-copy',
        'tryton-delete',
        'tryton-dialog-error',
        'tryton-dialog-information',
        'tryton-dialog-warning',
        'tryton-disconnect',
        'tryton-executable',
        'tryton-find-replace',
        'tryton-find',
        'tryton-folder-new',
        'tryton-fullscreen',
        'tryton-go-home',
        'tryton-go-jump',
        'tryton-go-next',
        'tryton-go-previous',
        'tryton-help',
        'tryton-icon',
        'tryton-list-add',
        'tryton-list-remove',
        'tryton-locale',
        'tryton-lock',
        'tryton-log-out',
        'tryton-mail-message-new',
        'tryton-mail-message',
        'tryton-new',
        'tryton-open',
        'tryton-preferences-system-session',
        'tryton-preferences-system',
        'tryton-preferences',
        'tryton-print-email',
        'tryton-print-open',
        'tryton-print',
        'tryton-refresh',
        'tryton-save-as',
        'tryton-save',
        'tryton-star',
        'tryton-start-here',
        'tryton-system-file-manager',
        'tryton-system',
        'tryton-text-background',
        'tryton-text-foreground',
        'tryton-text-markup',
        'tryton-undo',
        'tryton-unstar',
        'tryton-web-browser'
    ];

    Sao.common.IconFactory = Sao.class_(Object, {
        batchnum: 10,
        name2id: {},
        loaded_icons: {},
        tryton_icons: [],
        load_icons: function(refresh) {
            refresh = refresh || false;
            if (!refresh) {
                this.name2id = {};
                for (var icon_name in this.load_icons) {
                    if (!this.load_icons.hasOwnProperty(icon_name)) {
                        continue;
                    }
                    window.URL.revokeObjectURL(this.load_icons[icon_name]);
                }
                this.loaded_icons = {};
            }
            this.tryton_icons = [];

            var icon_model = new Sao.Model('ir.ui.icon');
            return icon_model.execute('list_icons', []).then(function(icons) {
                var icon_id, icon_name;
                for (var i=0, len=icons.length; i < len; i++) {
                    icon_id = icons[i][0];
                    icon_name = icons[i][1];
                    if (refresh && (icon_name in this.loaded_icons)) {
                        continue;
                    }
                    this.tryton_icons.push([icon_id, icon_name]);
                    this.name2id[icon_name] = icon_id;
                }
            }.bind(this));
        },
        register_icon: function(icon_name) {
            if (!icon_name) {
                return jQuery.when('');
            } else if ((icon_name in this.loaded_icons) ||
                    ~Sao.common.LOCAL_ICONS.indexOf(icon_name)) {
                return jQuery.when(this.get_icon_url(icon_name));
            }
            var loaded_prm;
            if (!(icon_name in this.name2id)) {
                loaded_prm = this.load_icons(true);
            } else {
                loaded_prm = jQuery.when();
            }

            var icon_model = new Sao.Model('ir.ui.icon');
            return loaded_prm.then(function () {
                var find_array = function(array) {
                    var idx, l;
                    for (idx=0, l=this.tryton_icons.length; idx < l; idx++) {
                        var icon = this.tryton_icons[idx];
                        if (Sao.common.compare(icon, array)) {
                            break;
                        }
                    }
                    return idx;
                }.bind(this);
                var idx = find_array([this.name2id[icon_name], icon_name]);
                var from = Math.round(idx - this.batchnum / 2);
                from = (from < 0) ? 0 : from;
                var to = Math.round(idx + this.batchnum / 2);
                var ids = [];
                this.tryton_icons.slice(from, to).forEach(function(e) {
                    ids.push(e[0]);
                });

                var read_prm = icon_model.execute('read',
                    [ids, ['name', 'icon']]);
                return read_prm.then(function(icons) {
                    icons.forEach(function(icon) {
                        var blob = new Blob([icon.icon],
                            {type: 'image/svg+xml'});
                        var img_url = window.URL.createObjectURL(blob);
                        this.loaded_icons[icon.name] = img_url;

                        delete this.name2id[icon.name];
                        this.tryton_icons.splice(
                            find_array([icon.id, icon.name]), 1);
                    }.bind(this));
                    return this.get_icon_url(icon_name);
                }.bind(this));
            }.bind(this));
        },
        get_icon_url: function(icon_name) {
            if (icon_name in this.loaded_icons) {
                return this.loaded_icons[icon_name];
            }
            return "images/" + icon_name + ".svg";
        }
    });

    Sao.common.ICONFACTORY = new Sao.common.IconFactory();

    Sao.common.UniqueDialog = Sao.class_(Object, {
        init: function() {
            this.running = false;
        },
        build_dialog: function() {
        },
        run: function() {
            if (this.running) {
                return;
            }
            var args = Array.prototype.slice.call(arguments);
            var prm = jQuery.Deferred();
            args.push(prm);
            var dialog = this.build_dialog.apply(this, args);
            this.running = true;
            dialog.dialog('open');
            return prm;
        },
        close: function(dialog) {
            dialog.dialog('close');
            this.running = false;
        }
    });

    Sao.common.MessageDialog = Sao.class_(Sao.common.UniqueDialog, {
        class_: 'message-dialog',
        build_dialog: function(message, icon, prm) {
            var dialog = jQuery('<div/>', {
                'class': this.class_
            });
            dialog.append(jQuery('<p/>')
                .text(message)
                .prepend(jQuery('<span/>', {
                    'class': 'dialog-icon'
                }).append(jQuery('<span/>', {
                    'class': 'ui-icon ' + icon
                }))));
            dialog.dialog({
                modal: true,
                autoOpen: false,
                buttons: {
                    'OK': function() {
                        this.close(dialog);
                        prm.resolve('ok');
                    }.bind(this)
                }
            });
            return dialog;
        },
        run: function(message, icon) {
            Sao.common.MessageDialog._super.run.call(
                    this, message, icon || 'ui-icon-info');
        }
    });
    Sao.common.message = new Sao.common.MessageDialog();
}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.Window = {};

    Sao.Window.Form = Sao.class_(Object, {
        init: function(screen, callback, kwargs) {
            kwargs = kwargs || {};
            this.screen = screen;
            this.screen.screen_container.alternate_view = true;
            var view_type = kwargs.view_type || 'form';

            var form_prm = jQuery.when();
            var screen_views = [];
            for (var i = 0, len = this.screen.views.length; i < len; i++) {
                screen_views.push(this.screen.views[i].view_type);
            }
            if (!~screen_views.indexOf(view_type) &&
                !~this.screen.view_to_load.indexOf(view_type)) {
                form_prm = this.screen.add_view_id(null, view_type);
            }

            var switch_prm = form_prm.then(function() {
                return this.screen.switch_view(view_type).done(function() {
                    if (kwargs.new_) {
                        this.screen.new_();
                    }
                }.bind(this));
            }.bind(this));
            this.many = kwargs.many || 0;
            this.domain = kwargs.domain || null;
            this.context = kwargs.context || null;
            this.save_current = kwargs.save_current;
            this.prev_view = screen.current_view;
            this.callback = callback;
            this.el = jQuery('<div/>');

            var buttons = [];
            buttons.push({
                text: (!kwargs.new_ && this.screen.current_view &&
                       this.screen.current_record.id < 0 ?
                       'Delete' : 'Cancel'),
                click: function() {
                    this.response('RESPONSE_CANCEL');
                }.bind(this)
            });

            if (kwargs.new_ && this.many) {
                buttons.push({
                    text: 'New',
                    click: function() {
                        this.response('RESPONSE_ACCEPT');
                    }.bind(this)
                });
            }

            if (this.save_current) {
                buttons.push({
                    text: 'Save',
                    click: function() {
                        this.response('RESPONSE_OK');
                    }.bind(this)
                });
            } else {
                buttons.push({
                    text: 'OK',
                    click: function() {
                        this.response('RESPONSE_OK');
                    }.bind(this)
                });
            }

            var menu;
            if (view_type == 'tree') {
                menu = jQuery('<div/>');
                var access = Sao.common.MODELACCESS.get(this.screen.model_name);
                if (this.domain) {
                    this.wid_text = jQuery('<input/>', {
                        type: 'input'
                    });
                    menu.append(this.wid_text);

                    this.but_add = jQuery('<button/>').button({
                        icons: {
                            primary: 'ui-icon-plus'
                        },
                        label: 'Add'
                    });
                    this.but_add.click(this.add.bind(this));
                    menu.append(this.but_add);
                    this.but_add.prop('disabled', !access.read);

                    this.but_remove = jQuery('<button/>').button({
                        icons: {
                            primary: 'ui-icon-minus'
                        },
                        label: 'Remove'
                    });
                    this.but_remove.click(this.remove.bind(this));
                    menu.append(this.but_remove);
                    this.but_remove.prop('disabled', !access.read);
                }

                this.but_new = jQuery('<button/>').button({
                    icons: {
                        primary: 'ui-icon-document'
                    },
                    label: 'New'
                });
                this.but_new.click(this.new_.bind(this));
                menu.append(this.but_new);
                this.but_new.prop('disabled', !access.create);

                this.but_del = jQuery('<button/>').button({
                    icons: {
                        primary: 'ui-icon-trash'
                    },
                    label: 'Delete'
                });
                this.but_del.click(this.delete_.bind(this));
                menu.append(this.but_del);
                this.but_del.prop('disabled', !access['delete']);

                this.but_undel = jQuery('<button/>').button({
                    icons: {
                        primary: 'ui-icon-arrowreturn-1-s'
                    },
                    label: 'Undelete'
                });
                this.but_undel.click(this.undelete.bind(this));
                menu.append(this.but_undel);

                this.but_previous = jQuery('<button/>').button({
                    icons: {
                        primary: 'ui-icon-arrowthick-1-w'
                    },
                    label: 'Previous'
                });
                this.but_previous.click(this.previous.bind(this));
                menu.append(this.but_previous);

                this.label = jQuery('<span/>');
                this.label.text('(0, 0)');
                menu.append(this.label);

                this.but_next = jQuery('<button/>').button({
                    icons: {
                        primary: 'ui-icon-arrowthick-1-e'
                    },
                    label: 'Next'
                });
                this.but_next.click(this.next.bind(this));
                menu.append(this.but_next);

                this.but_switch = jQuery('<button/>').button({
                    icons: {
                        primary: 'ui-icon-newwin'
                    },
                    label: 'Switch'
                });
                this.but_switch.click(this.switch_.bind(this));
                menu.append(this.but_switch);
            }


            switch_prm.done(function() {
                this.el.dialog({
                    modal: true,
                    autoOpen: false,
                    buttons: buttons,
                    title: '' // this.screen.current_view
                });
                if (menu) {
                    this.el.append(menu);
                }
                this.el.append(this.screen.screen_container.alternate_viewport);
                this.el.dialog('open');
                this.screen.display();
            }.bind(this));

        },
        add: function() {
            // TODO
        },
        remove: function() {
            this.screen.remove(false, true, false);
        },
        new_: function() {
            this.screen.new_();
        },
        delete_: function() {
            this.screen.remove(false, false, false);
        },
        undelete: function() {
            this.screen.unremove();
        },
        previous: function() {
            this.screen.display_previous();
        },
        next: function() {
            this.screen.display_next();
        },
        switch_: function() {
            this.screen.switch_view();
        },
        response: function(response_id) {
            var result;
            this.screen.current_view.set_value();

            if (~['RESPONSE_OK', 'RESPONSE_ACCEPT'].indexOf(response_id) &&
                    this.screen.current_record) {
                this.screen.current_record.validate().then(function(validate) {
                    var closing_prm = jQuery.Deferred();
                    if (validate && this.save_current) {
                        this.screen.save_current().then(closing_prm.resolve,
                            closing_prm.reject);
                    } else if (validate &&
                            this.screen.current_view.view_type == 'form') {
                        var view = this.screen.current_view;
                        var validate_prms = [];
                        for (var name in this.widgets) {
                            var widget = this.widgets[name];
                            if (widget.screen && widget.screen.pre_validate) {
                                var record = widget.screen.current_record;
                                if (record) {
                                    validate_prms.push(record.pre_validate());
                                }
                            }
                        }
                        jQuery.when.apply(jQuery, validate_prms).then(
                            closing_prm.resolve, closing_prm.reject);
                    } else if (!validate) {
                        closing_prm.reject();
                    } else {
                        closing_prm.resolve();
                    }

                    closing_prm.fail(function() {
                        // TODO set_cursor
                        this.screen.display();
                    }.bind(this));

                    // TODO Add support for many
                    closing_prm.done(function() {
                        if (response_id == 'RESPONSE_ACCEPT') {
                            this.screen.new_();
                            this.screen.current_view.display();
                            // TODO set_cursor
                            this.many -= 1;
                            if (this.many === 0) {
                                this.but_new.prop('disabled', true);
                            }
                        } else {
                            this.callback(result);
                            this.destroy();
                        }
                    }.bind(this));
                }.bind(this));
                return;
            }

            if (response_id == 'RESPONSE_CANCEL' &&
                    this.screen.current_record) {
                result = false;
                if ((this.screen.current_record.id < 0) || this.save_current) {
                    this.screen.group.remove(this.screen.current_record, true);
                } else if (this.screen.current_record.has_changed()) {
                    this.screen.current_record.cancel();
                    this.screen.current_record.reload().always(function() {
                        this.callback(result);
                        this.destroy();
                    }.bind(this));
                    return;
                }
            } else {
                result = response_id != 'RESPONSE_CANCEL';
            }
            this.callback(result);
            this.destroy();
        },
        destroy: function() {
            this.screen.screen_container.alternate_view = false;
            this.screen.screen_container.alternate_viewport.children()
                .detach();
            this.el.dialog('destroy');
        }
    });

    Sao.Window.Attachment = Sao.class_(Sao.Window.Form, {
        init: function(record, callback) {
            this.resource = record.model.name + ',' + record.id;
            this.attachment_callback = callback;
            var screen = new Sao.Screen('ir.attachment', {
                domain: [['resource', '=', this.resource]],
                mode: ['tree', 'form'],
                context: {
                    resource: this.resource
                },
                exclude_field: 'resource'
            });
            screen.switch_view().done(function() {
                screen.search_filter();
                screen.parent = record;
            });
            Sao.Window.Attachment._super.init.call(this, screen, this.callback,
                {view_type: 'tree'});
        },
        callback: function(result) {
            if (result) {
                this.screen.group.save();
            }
            if (this.attachment_callback) {
                this.attachment_callback();
            }
        }
    });

    Sao.Window.Search = Sao.class_(Object, {
        init: function(model, callback, kwargs) {
            kwargs = kwargs || {};
            var views_preload = kwargs.views_preload || {};
            this.model_name = model;
            this.domain = kwargs.domain || [];
            this.context = kwargs.context || {};
            this.sel_multi = kwargs.sel_multi;
            this.callback = callback;
            this.el = jQuery('<div/>');

            var buttons = [];
            buttons.push({
                text: 'Cancel',
                click: function() {
                    this.response('RESPONSE_CANCEL');
                }.bind(this)
            });
            buttons.push({
                text: 'Find',
                click: function() {
                    this.response('RESPONSE_APPLY');
                }.bind(this)
            });
            if (kwargs.new_ && Sao.common.MODELACCESS.get(model).create) {
                buttons.push({
                    text: 'New',
                    click: function() {
                        this.response('RESPONSE_ACCEPT');
                    }.bind(this)
                });
            }
            buttons.push({
                text: 'OK',
                click: function() {
                    this.response('RESPONSE_OK');
                }.bind(this)
            });

            this.el.dialog({
                modal: true,
                title: 'Search',  // TODO translate
                autoOpen: false,
                buttons: buttons
            });
            this.screen = new Sao.Screen(model, {
                mode: ['tree'],
                context: this.context,
                view_ids: kwargs.view_ids,
                views_preload: views_preload
            });
            if (!jQuery.isEmptyObject(kwargs.ids)) {
                this.screen.new_group(kwargs.ids);
            }
            this.screen.load_next_view().done(function() {
                this.screen.switch_view().done(function() {
                    this.el.append(this.screen.screen_container.el);
                    this.el.dialog('open');
                    this.screen.display();
                }.bind(this));
            }.bind(this));
        },
        response: function(response_id) {
            var records;
            var value = [];
            if (response_id == 'RESPONSE_OK') {
                records = this.screen.current_view.selected_records();
            } else if (response_id == 'RESPONSE_APPLY') {
                this.screen.search_filter();
                return;
            } else if (response_id == 'RESPONSE_ACCEPT') {
                var screen = new Sao.Screen(this.model_name, {
                    domain: this.domain,
                    context: this.context,
                    mode: ['form']
                });

                var callback = function(result) {
                    if (result) {
                        screen.save_current().then(function() {
                            var record = screen.current_record;
                            this.callback([[record.id,
                                record._values.rec_name || '']]);
                        }.bind(this), function() {
                            this.callback(null);
                        }.bind(this));
                    } else {
                        this.callback(null);
                    }
                };
                this.el.dialog('destroy');
                new Sao.Window.Form(screen, callback.bind(this), {
                    new_: true
                });
                return;
            }
            if (records) {
                var index, record;
                for (index in records) {
                    record = records[index];
                    value.push([record.id, record._values.rec_name || '']);
                }
            }
            this.callback(value);
            this.el.dialog('destroy');
        }
    });

    Sao.Window.Preferences = Sao.class_(Object, {
        init: function(callback) {
            this.callback = callback;
            this.el = jQuery('<div/>');

            var buttons = [];
            buttons.push({
                text: 'Cancel',  // TODO translate
                click: function() {
                    this.response('RESPONSE_CANCEL');
                }.bind(this)
            });
            buttons.push({
                text: 'Ok',  // TODO translate
                click: function() {
                    this.response('RESPONSE_OK');
                }.bind(this)
            });

            this.el.dialog({
                modal: true,
                title: 'Preferences',  // TODO translate
                autoOpen: false,
                buttons: buttons
            });

            this.screen = new Sao.Screen('res.user', {
                mode: []
            });
            // TODO fix readonly from modelaccess

            var set_view = function(view) {
                this.screen.add_view(view);
                this.screen.switch_view().done(function() {
                    this.screen.new_(false);
                    this.screen.model.execute('get_preferences', [false], {})
                    .then(set_preferences.bind(this), this.destroy);
                }.bind(this));
            };
            var set_preferences = function(preferences) {
                this.screen.current_record.set(preferences);
                this.screen.current_record.id =
                    this.screen.model.session.user_id;
                this.screen.current_record.validate(null, true).then(
                        function() {
                            this.screen.display();
                        }.bind(this));
                this.el.append(this.screen.screen_container.el);
                this.el.dialog('open');
            };

            this.screen.model.execute('get_preferences_fields_view', [], {})
                .then(set_view.bind(this), this.destroy);
        },
        response: function(response_id) {
            if (response_id == 'RESPONSE_OK') {
                this.screen.current_record.validate().then(function(validate) {
                    if (validate) {
                        var values = jQuery.extend({}, this.screen.get());
                        var password = false;
                        if ('password' in values) {
                            // TODO translate
                            password = window.prompt('Current Password:');
                            if (!password) {
                                return;
                            }
                        }
                        this.screen.model.execute('set_preferences',
                                [values, password], {}).done(function() {
                                    this.destroy();
                                    this.callback();
                                }.bind(this));
                    } else {
                        this.destroy();
                        this.callback();
                    }
                }.bind(this));
            }
            this.destroy();
            this.callback();
        },
        destroy: function() {
            this.el.dialog('destroy');
        }
    });

}());

/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.Wizard = Sao.class_(Object, {
        init: function(name) {
            this.widget = jQuery('<div/>', {
                'class': 'wizard'
            });
            this.name = name;
            this.id = null;
            this.ids = null;
            this.action = null;
            this.context = null;
            this.states = {};
            this.session_id = null;
            this.start_state = null;
            this.end_state = null;
            this.screen = null;
            this.screen_state = null;
            this.state = null;
            this.session = Sao.Session.current_session;
            this.__processing = false;
            this.__waiting_response = false;
        },
        run: function(attributes) {
            this.action = attributes.action;
            this.id = attributes.data.id;
            this.ids = attributes.data.ids;
            this.model = attributes.data.model;
            this.context = attributes.context;
            Sao.rpc({
                'method': 'wizard.' + this.action + '.create',
                'params': [this.session.context]
            }, this.session).then(function(result) {
                this.session_id = result[0];
                this.start_state = this.state = result[1];
                this.end_state = result[2];
                this.process();
            }.bind(this));
        },
        process: function() {
            if (this.__processing || this.__waiting_response) {
                return;
            }
            var process = function() {
                if (this.state == this.end_state) {
                    this.end();
                    return;
                }
                var ctx = jQuery.extend({}, this.context);
                ctx.active_id = this.id;
                ctx.active_ids = this.ids;
                ctx.active_model = this.model;
                var data = {};
                if (this.screen) {
                    data[this.screen_state] = this.screen.get_on_change_value();
                }
                Sao.rpc({
                    'method': 'wizard.' + this.action + '.execute',
                    'params': [this.session_id, data, this.state, ctx]
                }, this.session).then(function(result) {
                    if (result.view) {
                        this.clean();
                        var view = result.view;
                        this.update(view.fields_view, view.defaults,
                            view.buttons);
                        this.screen_state = view.state;
                        this.__waiting_response = true;
                    } else {
                        this.state = this.end_state;
                    }

                    if (result.actions) {
                        if (!result.view) {
                            this.end();
                        }
                        result.actions.forEach(function(action) {
                            Sao.Action.exec_action(action[0], action[1], ctx);
                        });
                        if ((!result.view) ||
                            (result.actions[result.actions.length - 1].type ==
                             'ir.action.wizard')) {
                            return;
                        }
                    }

                    if (!this.__waiting_response) {
                        process();
                    } else if (this.state == this.end_state) {
                        this.end();
                    }
                    this.__processing = false;
                }.bind(this), function(result) {
                    // TODO end for server error.
                    this.__processing = false;
                }.bind(this));
            };
            process.call(this);
        },
        destroy: function() {
            // TODO
        },
        end: function() {
            Sao.rpc({
                'method': 'wizard.' + this.action + '.delete',
                'params': [this.session_id, this.session.context]
            }, this.session);
            // TODO reload context if config_wizard
        },
        clean: function() {
            this.widget.children().remove();
            this.states = {};
        },
        response: function(state) {
            this.__waiting_response = false;
            this.screen.current_view.set_value();
            this.screen.current_record.validate().then(function(validate) {
                if ((!validate) && state != this.end_state) {
                    this.screen.display();
                    return;
                }
                this.state = state;
                this.process();
            }.bind(this));
        },
        _get_button: function(definition) {
            var button = new Sao.common.Button(definition);
            this.states[definition.state] = button;
            return button;
        },
        update: function(view, defaults, buttons) {
            buttons.forEach(function(button) {
                this._get_button(button);
            }.bind(this));
            this.screen = new Sao.Screen(view.model,
                    {mode: [], context: this.context});
            this.screen.add_view(view);
            this.screen.switch_view();
            // TODO record-modified
            // TODO title
            // TODO toolbar
            this.widget.append(this.screen.screen_container.el);

            this.screen.new_(false);
            this.screen.current_record.set_default(defaults);
            // TODO set_cursor
        }
    });

    Sao.Wizard.create = function(attributes) {
        var win;
        if (attributes.window) {
            win = new Sao.Wizard.Form(attributes.name);
        } else {
            win = new Sao.Wizard.Dialog(attributes.name);
        }
        win.run(attributes);
    };

    // TODO Wizard.Form

    Sao.Wizard.Dialog = Sao.class_(Sao.Wizard, { // TODO nomodal
        init: function(name) {
            if (!name) {
                name = 'Wizard'; // TODO translate
            }
            Sao.Wizard.Dialog._super.init.call(this);
            this.dialog = jQuery('<div/>', {
                'class': 'wizard-dialog'
            });
            this.dialog.dialog({
                dialogClass: 'no-close',
                title: name,
                modal: true,
                autoOpen: false,
                closeOnEscape: false,
                buttons: [{text: 'dummy'}]
            });
            this.dialog.append(this.widget);
            this.buttonset = this.dialog.parent().find('.ui-dialog-buttonset');
        },
        clean: function() {
            Sao.Wizard.Dialog._super.clean.call(this);
            this.buttonset.children().remove();
        },
        _get_button: function(definition) {
            var button = Sao.Wizard.Dialog._super._get_button.call(this,
                    definition);
            this.buttonset.append(button.el);
            button.el.click(function() {
                this.response(definition.state);
            }.bind(this));
            // TODO default
            return button;
        },
        update: function(view, defaults, buttons) {
            Sao.Wizard.Dialog._super.update.call(this, view, defaults,
                    buttons);
            // TODO set size
            this.dialog.dialog('open');
        },
        destroy: function() {
            Sao.Wizard.Dialog._super.destroy.call(this);
            this.dialog.dialog('destroy');
            // TODO other dialogs
            // TODO reload under screen
        },
        end: function() {
            Sao.Wizard.Dialog._super.end.call(this);
            this.destroy();
        },
        show: function() {
            this.dialog.dialog('open');
        },
        hide: function() {
            this.dialog.dialog('close');
        },
        state_changed: function() {
            this.process();
        }
    });

}());
