/**
 * @name FakeNitro
 * @description Allows you to use nitro features without nitro
 * @version 1.0.0
 * @author 5bra
 * @source https://github.com/5bra3mk/fakenitro
 */

const { Plugin } = require('powercord/entities');
const { getModule } = require('powercord/webpack');
const { inject, uninject } = require('powercord/injector');

module.exports = class FakeNitro extends Plugin {
  async startPlugin () {
    // Load required Discord modules
    this._loadModules();

    // Apply patches
    this._patchMessageSending();
  }

  async _loadModules () {
    // Get all necessary Discord modules
    this.modules = {
      Permissions: await getModule(['Permissions']),
      PermissionStore: await getModule(['can', 'canEveryone']),
      ChannelStore: await getModule(['getChannel']),
      UserStore: await getModule(['getCurrentUser']),
      EmojiStore: await getModule(['getCustomEmojiById']),
      MessageActions: await getModule(['sendMessage', 'editMessage']),
      getEmojiURL: await getModule(['getEmojiURL'])
    };
  }

  _patchMessageSending () {
    this.messageSendPatch = inject(
      'fake-nitro-send',
      this.modules.MessageActions,
      'sendMessage',
      ([channelId, message], res) => {
        if (!this.settings.get('enableEmojiBypass', true)) {
          return [channelId, message];
        }

        const modified = this._processMessageContent(channelId, message.content);
        return [channelId, { ...message, content: modified }];
      },
      true
    );
  }

  _processMessageContent (channelId, content) {
    const emojiMatches = content.match(/<a?:(\w+):(\d+)>/g) || [];
    let modifiedContent = content;

    for (const emojiStr of emojiMatches) {
      const [, name, id] = emojiStr.match(/<a?:(\w+):(\d+)>/);
      const emoji = this.modules.EmojiStore.getCustomEmojiById(id);
      
      if (this._canUseEmote(emoji, channelId)) continue;

      const size = this.settings.get('emojiSize', 48);
      const url = new URL(this.modules.getEmojiURL(id, emoji?.animated, size));
      url.searchParams.set('size', size);
      url.searchParams.set('name', name);

      const linkText = this.settings.get('hyperLinkText', '{{NAME}}').replace('{{NAME}}', name);
      
      modifiedContent = modifiedContent.replace(
        emojiStr,
        this.settings.get('useHyperLinks', true) 
          ? `[${linkText}](${url})` 
          : url.toString()
      );
    }

    return modifiedContent;
  }

  _canUseEmote (emoji, channelId) {
    if (!emoji?.id) return true; // Unicode emojis
    if (emoji.available === false) return false;

    const hasExternalPerms = this.modules.PermissionStore.can(
      this.modules.Permissions.USE_EXTERNAL_EMOJIS,
      this.modules.ChannelStore.getChannel(channelId)
    );

    return emoji.guild_id === this._getCurrentGuildId() || hasExternalPerms;
  }

  _getCurrentGuildId () {
    const channel = this.modules.ChannelStore.getChannel(
      this.modules.ChannelStore.getLastSelectedChannelId()
    );
    return channel?.guild_id;
  }

  pluginWillUnload () {
    uninject('fake-nitro-send');
  }
};