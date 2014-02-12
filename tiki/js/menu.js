define([
    'jquery',
    'underscore',
    'backbone',
    './util',
    './tools'
], function($, _, Backbone, Util, Tools) {
    'use strict';

    // =========
    // = Utils =
    // =========
    function makeview(view, model) {
        if(view.prototype.render) // its a View
            return new view({model: model});
        else // a callable returning a View
            return view(model);
    }

    // ==========================
    // = Models and collections =
    // ==========================
    var MenuModel = Backbone.Model.extend({
        defaults: function() {
            return {
                options: new Options()
            };
        },
        parse: function(json, xhr) {
            // parse config shorthands
            json.options = new Options(_.map(json.options, function(o) {
                if(o == '-')
                    return {view: Spacer};
                return o;
            }), {parse: true});
                    
            return json;
        }
    });
    
    var OptionModel = Backbone.Model.extend({
        defaults: {
            enabled: true,
            submenu: null,  // new MenuModel()
            expanded: false
        },
        parse: function(json, xhr) {
            if(json.submenu) 
                json.submenu = new MenuModel(json.submenu, {parse: true});
            return json;
        }
    });
    
    var Options = Backbone.Collection.extend({
        model: OptionModel
    });
    

    

    // =========
    // = Views =
    // =========
    var Option = Backbone.View.extend({
        className: 'selectable',
        tagName: 'li',
        template: Util.template('<span>${obj.text}</span><i>&#xe10a;</i>'),

        render: function() {
            this.$el.html(this.template(this.model.toJSON()));
            if(!this.model.get('enabled'))
                this.$el.addClass('disabled').removeClass('selectable');
            
            this.$el.toggleClass('submenu', !!this.model.get('submenu'));
            if($.browser.ltie9) {
                this.$('>a').attr('unselectable', 'on');
            }
            return this;
        }
        
    });
    var Spacer = Backbone.View.extend({
        tagName: 'li',
        className: 'spacer',

        initialize: function(config) {
            this.config = config;
        },
        render: function() {
            return this;
        }
    });


    /*
    // Create a menu
    var m = new menu.Menu({
        options: [
            {id: 'foo', text: 'Foo'},
            {id: 'bar', text: 'Bar', enabled: false},
            {id: 'lax', text: 'Lax', view: LaxOption},
            '-',
            {id: 'filters', text: 'Filters', submenu: {
                view: MySpecialMenu,
                options: [
                    {id: 'foo2', text: 'Foo 2'},
                    {id: 'bar2', text: 'Bar 2'},
                    {id: 'lax2', text: 'Lax 2'},
                ]            
            }}
        ]
    })
    
    // Hide any other active menu, render and if necessary, append to body.
    m.show();  triggers "show"

    // Align to otherEl 
    m.alignTo(otherEl, alignment_options);

    // detach menu view, triggers "hide"
    m.hide(); 

    // Play with the options
    var opt = m.options.at(4);
    opt.set('expanded', true);
    opt.set('enabled', false);
    m.model.get('options').add({id: 'helo', text: 'I am new option'})

    // Add handler
    m.selectable.on('choose', function(e) {
        consolse.log('you chose: ', e);
    });
    
    */
    var Menu = Tools.View.extend({
        tagName: 'div', 
        className: 'tiki-menu',
        attributes: {
            tabindex: 0
        },
        events: {
            'mouseover li': 'onMouseOver',
            'blur': 'onBlur',
            'click li.selectable': 'onSelectableClick',
            'keydown': 'onKeyDown',
            'keyup': 'onKeyUp',
            'mouseup': 'onMouseUp'
        },
        hotkeys: {
            'keydown right': 'onRightKeyDown',
            'keydown left': 'onLeftKeyDown',
            'keydown esc': 'onESCKeyDown'
        },
        _isroot: true,
        initialize: function(config) {
            config = config || {};
            _.bindAll(this, 'onShowTimeout', 'onKeyUpTimeout');
            this._views = {};
            this.overlay = config.overlay;
            if(config.model)
                this.model = config.model;
            else
                this.model = new MenuModel(config, {parse: true});
            
            // Observe the options-collection
            var options = this.model.get('options');
            options.on('add', this.addOne, this);
            options.on('remove', this.removeOne, this);
            options.on('change:expanded', this.onExpandedChange, this);
            
            // Create a Selectable
            this.selectable = new Tools.Selectable({
                el: this.el,
                selectables: 'li.selectable',
                collection: options,
                // chooseOnClick: true,
                chooseOnMouseUp: true,                
                chooseOnDblClick: false
            });
            this.selectable.on('choose', this.onSelectableChoose, this);
            this.selectable.on('select', this.onSelectableSelect, this);
            this.selectable.on('unselect', this.onSelectableUnselect, this);
            this.selectable.on('beforechoose', this.onBeforeChoose, this);
            this.$el.scrollMeOnly();
            if($.browser.ltie8) {
                this.$el.iefocus();
                this.el.hideFocus = true;
            }
            if($.browser.ltie10)
                this.$el.attr('unselectable', 'on');                     
        },
        render: function() {
            this.$el.empty().append('<ul></ul>');
            this.model.get('options').each(function(option) {
                this.addOne(option);
            }, this);
            return this;
        },
        addOne: function(option) {
            var view = makeview(option.get('view') || Option, option);
            this._views[option.cid] = view;
            this.$('>ul').append(view.render().el);
            
            // render a submenu as well?
            if(option.get('submenu') && option.get('expanded'))
                this._showSubmenu(option);
        },
        removeOne: function(option) {
            this._views[option.cid].remove();
        },
        
        _showSubmenu: function(model) {
            var menu = makeview(model.get('view') || Menu, model.get('submenu'));
            menu.show({hideOther:false, focus:false}).alignTo(this._views[model.cid].el, {at: 'right top'});

            // set silly properties, factor away these
            menu._isroot = false;
            menu._parentmenu = this;
            this._submenu = menu;            
        },
        _hideSubmenu: function(model) {
            this._submenu.hide();
            this._submenu = null;
        },        
        _hideAll: function() {
            if(this._submenu) 
                this._submenu.hide();
            for(var menu=this; menu; menu=menu._parentmenu) 
                menu.hide();
        },
        
                        
        show: function(options) {
            var opt = Util.defs(options, {
                hideOther: true,
                focus: true,
                alignTo: false,
                left: false,
                top: false});
               
            var availHeight = $(this.el.ownerDocument.documentElement).height() - 10; // ~10px dropshadow
            this.$el.css('max-height', availHeight);
                        
            if(opt.hideOther && Menu.active) 
                Menu.active.hide();
            Menu.active = this;
            
            // implicit dom insert
            if(!this.el.parentElement)
                $(document.body).append(this.render().el);

            if(opt.alignTo) {
                this.alignTo(opt.alignTo.of, opt.alignTo);
                if(opt.focus)
                    this.$el.focus();                
            } 
            else if(opt.left !== false && opt.top !== false) {
                this.$el.css({left: opt.left, top: opt.top});
                if(opt.focus)
                    this.$el.focus();                
            }
            this._okMouseUp = false;
            window.setTimeout(this.onShowTimeout, 350);            
            this.trigger('show', this);
            return this;
        },
        hide: function() {  
            if(!this.$el.is(':visible'))
                return;
        
            this.$el.fadeOutFast({detach:true});
            this.trigger('hide', this);
            if(this._isroot)
                Menu.active = null;
        },
        alignTo: function(el, options) {            
            this.$el.position(_.defaults(options || {}, {
                my: 'left top',
                at: 'left bottom',
                of: el,
                collision: 'flip fit'
            }));
        },
        trigger: function() {
            // overload Backbone.Event.trigger to pass events upward the menu chain
            Menu.__super__.trigger.apply(this, arguments);
            if(this._parentmenu)
                this._parentmenu.trigger.apply(this._parentmenu, arguments);
        },
        onExpandedChange: function(model) {
            if(!model.get('submenu')) 
                return;
            if(model.get('expanded'))
                this._showSubmenu(model);
            else
                this._hideSubmenu(model);
        },        
        onSelectableChoose: function(e) {
            this._lock = true;
            e.selected.blink(_.bind(function() {
                this._hideAll();
                this._lock = false;
                this.trigger('select', e);                
            }, this));            
        },
        onSelectableSelect: function(e) {
            if(e.model.get('submenu')) 
                e.model.set('expanded', true);
            this.el.focus();
        },
        onSelectableUnselect: function(e) {
            if(e.model.get('submenu'))
                e.model.set('expanded', false);
        },        
        onMouseOver: function(e) {
            // todo: detach mouseover listener instead of _lock property
            if(this._lock || this.$el.is(':animated'))
                return;
                
            var target = $(e.currentTarget);
            if(target.is('li.selectable'))
                this.selectable.selectOne(target);
        },
        onBlur: function() {
            // When a focused menu loses focus to anything but another menu,
            // hide this menu and any sub/parent menus. Todo: abstract the 
            // setTimeout intto something reusable, quite common..
            window.setTimeout(_.bind(function(e) {
                var focused = this.el.ownerDocument.activeElement;
                if(!$(focused).is('.tiki-menu')) 
                    this._hideAll();
            }, this), 1);
        },
        onSelectableClick: function(e) {
            // clicking a submenu li should not propagate to parent menu's li
            // (causing more than one 'choose' event)
            e.stopPropagation();
        },
        onRightKeyDown: function(e) {
            var model = this.selectable.getSelectedModel();
            if(!model)  
                return;
            model.set('expanded', true);
            model.get('submenu').get('options').at(0);
            this._submenu.el.focus();                
            this._submenu.selectable.selectOne();
        },
        onLeftKeyDown: function(e) {
            if(!this._parentmenu)
                return;
            var model = this._parentmenu.selectable.getSelectedModel();
            model.set('expanded', false);
            this._parentmenu.el.focus();
        },
        onESCKeyDown: function(e) {
            this._hideAll();
        },
        onKeyDown: function(e) {
            this._okMouseUp = true;
            if(Util.isArrowKey(e))
                this._lock = true;
        },
        onKeyUp: function() {
            window.setTimeout(this.onKeyUpTimeout, 100);
        },
        onMouseUp: function(e) {
            this._okMouseUp = true;
        },
        onBeforeChoose: function(e) {
            e.cancel = !this._okMouseUp;
        },
        onShowTimeout: function() {
            this._okMouseUp = true;
        },
        onKeyUpTimeout: function() {
            this._lock = false;
        }
    });

    return {
        Menu: Menu,
        Spacer: Spacer
    };

});