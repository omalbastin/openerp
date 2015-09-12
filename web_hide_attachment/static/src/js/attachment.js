openerp.web_hide_attachment = function (instance) {
    var _t = instance.web._t;

    instance.web.Sidebar.include({
        init : function(){
            this._super.apply(this, arguments);
            console.log(this.getParent())
            parent = this.getParent()
            if (!parent.is_action_enabled('attach')){
            	var new_section = []
            	for (var i=0; i<this.sections.length; i++){
            		if (this.sections[i]['name'] != 'files'){
            			new_section.push(this.sections[i])
            		}
            	}
            	this.sections = new_section
            }
        },
 
    });
};
