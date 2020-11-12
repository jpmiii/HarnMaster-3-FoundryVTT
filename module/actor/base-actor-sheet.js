import { DiceHM3 } from "../dice-hm3.js";
import { HM3 } from "../config.js";
import * as utility from '../utility.js';

/**
 * Extend the basic ActorSheet with some common capabilities
 * @extends {ActorSheet}
 */
export class HarnMasterBaseActorSheet extends ActorSheet {

    /** @override */
    getData() {
        const data = super.getData();
        data.config = CONFIG.HM3;
        data.dtypes = ["String", "Number", "Boolean"];
        return data;
    }

    /** @override */
    async _onDropItem(event, data) {
        const actor = this.actor;
        if (!actor.owner) return false;
        const item = await Item.fromDropData(data);
        const itemName = item.name;
        const itemType = item.type;

        // Only gear is allowed to be duplicated; all
        // other items must be unique (and drop will
        // be rejected for them).
        if (!itemType.endsWith("gear")) {
            let found = false;
            actor.items.forEach(it => {
                // Generally, if the items have the same type and name, mark it as found
                if (!found) {
                    found = it.data.type === itemType && it.data.name === itemName;
                }
            });

            // Reject the drop request by returning false if a match was found
            if (found) {
                if (itemType === 'skill') {
                    console.warn(`HM3 | DragDrop of ${itemName}, a ${item.data.data.type} skill, onto ${actor.data.name} was rejected because an identically named skill already exists`);
                } else {
                    console.warn(`HM3 | DragDrop of ${itemName} of type ${itemType}} onto ${actor.data.name} rejected; ${itemName} already exists`);
                }
                return false;
            }
        }

        return super._onDropItem(event, data);
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.options.editable) return;

        // Add Inventory Item
        html.find('.item-create').click(this._onItemCreate.bind(this));

        // Update Inventory Item
        html.find('.item-edit').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.getOwnedItem(li.data("itemId"));
            item.sheet.render(true);
        });

        // Delete Inventory Item
        html.find('.item-delete').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            this.actor.deleteOwnedItem(li.data("itemId"));
            li.slideUp(200, () => this.render(false));
        });

        // Rollable abilities.
        html.find('.rollable').click(this._onRoll.bind(this));

        // Standard 1d100 vs. target number (asks for optional modifier)
        html.find('.std-roll').click(this._onStdRoll.bind(this));

        // Standard 1d100 vs. target number (asks for optional modifier)
        html.find('.d6-roll').click(this._onD6Roll.bind(this));

        // Damage Roll
        html.find('.damage-roll').click(this._onDamageRoll.bind(this));

        // Missile Attack Roll
        html.find('.missile-attack-roll').click(this._onMissileAttackRoll.bind(this));

        // Missile Damage Roll
        html.find('.missile-damage-roll').click(this._onMissileDamageRoll.bind(this));

        // Injury Roll
        html.find('.injury-roll').click(this._onInjuryRoll.bind(this));

        // Toggle carry state
        html.find('.item-carry').click(this._onToggleCarry.bind(this));

        // Toggle equip state
        html.find('.item-equip').click(this._onToggleEquip.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
     * @param {Event} event   The originating click event
     * @private
     */
    async _onItemCreate(event) {
        event.preventDefault();
        const header = event.currentTarget;
        // Get the type of item to create.
        const type = header.dataset.type;
        // Grab any data associated with this control.
        const data = duplicate(header.dataset);

        // Initialize a default name.
        let name = 'New Item';
        if (type === 'skill' && header.dataset.skilltype) {
            if (header.dataset.skilltype === 'Psionic') {
                name = utility.createUniqueName('New Psionic Talent', this.actor.itemTypes.skill);
            } else {
                name = utility.createUniqueName(`New ${header.dataset.skilltype} Skill`, this.actor.itemTypes.skill);
            }
        } else {
            switch (type) {
                case "weapongear":
                    name = utility.createUniqueName('New Weapon', this.actor.itemTypes.weapongear);
                    break;

                case "missilegear":
                    name = utility.createUniqueName('New Missile', this.actor.itemTypes.missilegear);
                    break;

                case "armorgear":
                    name = utility.createUniqueName('New Armor Item', this.actor.itemTypes.armorgear);
                    break;

                case "miscgear":
                    name = utility.createUniqueName('New Item', this.actor.itemTypes.miscgear);
                    break;

                case "armorlocation":
                    name = utility.createUniqueName('New Location', this.actor.itemTypes.armorlocation);
                    break;

                case "injury":
                    name = utility.createUniqueName('New Injury', this.actor.itemTypes.injury);
                    break;

                case "spell":
                    name = utility.createUniqueName('New Spell', this.actor.itemTypes.spell);
                    break;

                case "invocation":
                    name = utility.createUniqueName('New Invocation', this.actor.itemTypes.invocation);
                    break;

                default:
                    console.error(`HM3 | Can't create item: unknown item type '${type}'`);
                    return null;
            }

        }

        // Prepare the item object.
        const itemData = {
            name: name,
            type: type,
            data: data
        };
        // Remove the type from the dataset since it's in the itemData.type prop.
        delete itemData.data["type"];

        // Finally, create the item!
        const result = await this.actor.createOwnedItem(itemData);

        if (!result) {
            log.error(`HM3 | Error creating item '${name}' of type '${type}' on character '${this.actor.data.name}'`)
            return null;
        }

        // If the result is a skill, and if 'skillType' has been defined,
        // set the skill type appropriately.
        if (type === 'skill' && header.dataset.skilltype) {
            if (HM3.skillTypes.includes(header.dataset.skilltype)) {
                const ownedItem = this.actor.getOwnedItem(result._id);
                const updateData = { 'data.type': header.dataset.skilltype };
                await ownedItem.update(updateData);
            }
        }

        return result;
    }

    /**
     * Handle standard clickable rolls.  A "standard" roll is a 1d100
     * roll vs. some target value, with success being less than or equal
     * to the target value.
     * 
     * data-target = target value
     * data-label = Label Text
     * 
     * @param {Event} event 
     */
    _onStdRoll(event) {
        event.preventDefault();
        let fastforward = event.shiftKey || event.altKey || event.ctrlKey;

        this.actor.stdRoll(event.currentTarget.dataset.label, {
            target: Number(event.currentTarget.dataset.target),
            fastforward: fastforward
        });
    }

    /**
     * Handle d6 rolls.  A "d6" roll is a roll of multiple d6 dice vs.
     * some target value, with success being less than or equal
     * to the target value.
     * 
     * data-numdice = number of d6 to roll
     * data-target = target value
     * data-label = Label Text
     * 
     * @param {Event} event 
     */
    _onD6Roll(event) {
        event.preventDefault();
        let fastforward = event.shiftKey || event.altKey || event.ctrlKey;

        this.actor.d6Roll(event.currentTarget.dataset.label, {
            target: Number(event.currentTarget.dataset.target),
            numdice: Number(event.currentTarget.dataset.numdice),
            fastforward: fastforward
        });
    }

    /**
     * Handle damage rolls.  A damage roll is a roll of multiple d6 dice
     * plus weapon impact value (based on weapon aspect). This button
     * handles both the case where a specific weapon is known and not.
     * 
     * data-weapon = Name of weapon being used (or blank for unknown)
     * 
     * @param {Event} event 
     */
    _onDamageRoll(event) {
        event.preventDefault();
        this.actor.damageRoll(event.currentTarget.dataset.weapon);
    }

    /**
     * Handle missile damage rolls.  A damage roll is a roll of multiple d6 dice
     * plus missile impact value. This button
     * handles both the case where a specific weapon is known and not.
     * 
     * data-missile = Name of missile being used
     * data-aspect = Missile Aspect being used
     * data-impact-short = Short range missile impact
     * data-impact-medium = Medium range missile impact
     * data-impact-long = Long range missile impact
     * data-impact-extreme = Extreme range missile impact
     * 
     * @param {Event} event 
     */
    _onMissileDamageRoll(event) {
        event.preventDefault();
        this.actor.missileDamageRoll(event.currentTarget.dataset);
    }

    /**
     * Handle missile attack rolls.  A missile attack roll is a 1d100 roll
     * minus missile weapon range modifier.
     * 
     * data-missile = Name of missile being used
     * data-target = Target Attack ML (before modifiers)
     * data-aspect = Missile aspect
     * data-range-short = Short missile range
     * data-range-medium = Medium missile range
     * data-range-long = Long missile range
     * data-range-extreme = Extreme missile range
     * 
     * @param {Event} event 
     */
    _onMissileAttackRoll(event) {
        event.preventDefault();
        this.actor.missileAttackRoll(event.currentTarget.dataset);
    }

    /**
     * Handle clickable rolls.
     * @param {Event} event   The originating click event
     * @private
     */
    _onRoll(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;

        if (dataset.roll) {
            let roll = new Roll(dataset.roll, this.actor.data.data);
            let label = dataset.label ? `Rolling ${dataset.label}` : '';
            roll.roll().toMessage({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                flavor: label
            });
        }
    }

    /**
     * Handle injury rolls.  An injury roll is a randomly determined
     * location, taking the impact and checking against the armor at
     * that location to arrive at effective impact, and then determining
     * injury level and other effects based on the result.
     * 
     * @param {Event} event 
     */
    _onInjuryRoll(event) {
        event.preventDefault();
        this.actor.injuryRoll();
    }

    /**
     * Handle clickable rolls.
     * @param {Event} event   The originating click event
     * @private
     */
    _onRoll(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;

        if (dataset.roll) {
            let roll = new Roll(dataset.roll, this.actor.data.data);
            let label = dataset.label ? `Rolling ${dataset.label}` : '';
            roll.roll().toMessage({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                flavor: label
            });
        }
    }

    /**
     * Handle toggling the carry state of an Owned Item within the Actor
     * @param {Event} event   The triggering click event
     * @private
     */
    _onToggleCarry(event) {
        event.preventDefault();
        const itemId = event.currentTarget.closest(".item").dataset.itemId;
        const item = this.actor.getOwnedItem(itemId);

        // Only process inventory ("gear") items, otherwise ignore
        if (item.data.type.endsWith('gear')) {
            const attr = "data.isCarried";
            return item.update({ [attr]: !getProperty(item.data, attr) });
        }

        return null;
    }

    /**
     * Handle toggling the carry state of an Owned Item within the Actor
     * @param {Event} event   The triggering click event
     * @private
     */
    _onToggleEquip(event) {
        event.preventDefault();
        const itemId = event.currentTarget.closest(".item").dataset.itemId;
        const item = this.actor.getOwnedItem(itemId);

        // Only process inventory ("gear") items, otherwise ignore
        if (item.data.type.endsWith('gear')) {
            const attr = "data.isEquipped";
            return item.update({ [attr]: !getProperty(item.data, attr) });
        }

        return null;
    }

}