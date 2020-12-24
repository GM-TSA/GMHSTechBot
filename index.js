require('dotenv').config();

const Discord = require('discord.js');
const client = new Discord.Client({
  partials: [
    'MESSAGE',
    'REACTION'
  ]
});

const TOKEN = process.env.TOKEN;
if (!process.env.TOKEN) {
	console.error("Token required");
  process.exit();
}

const low = require('lowdb');
const { serialize } = require('lowdb/adapters/FileSync');
const db = low(new (require('lowdb/adapters/FileSync'))(__dirname + '/db.json'));

db.defaults({roleMsgChannelId: "", roleMsgId: "", clubs: []}).write();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  getRoleMessage().then(roleMsg => {
    updateRoleMsgText(roleMsg);
    checkEmojis(roleMsg);
  }).catch(error => {
    console.warn("Could not start bot with self role message", error)
  });
});

client.on('message', msg => {
  if (msg.guild) {
    var parts = msg.content.split(' ');
    if (parts[0] === "!gmb") {
      if (parts.length > 1) {
        switch (parts[1].toLowerCase()) {
          case ("here"):
            if (!msg.member.hasPermission('ADMINISTRATOR')) return msg.reply("You don't have permission to perform that command.");
            msg.channel.send("Setting up self-roles here...").then(roleMsg => {
              db.set('roleMsgChannelId', roleMsg.channel.id).write();
              db.set('roleMsgId', roleMsg.id).write();
              updateRoleMsgText(roleMsg);
              checkEmojis(roleMsg);
              msg.reply("Set Up!").then(setUpMsg => {
                setUpMsg.delete({ timeout: 1000 });
                msg.delete({ timeout: 1000 });
              });
            }).catch(error => {
              console.error(error);
              msg.reply("Failed to set up.").then(message => {
                message.delete({ timeout: 1000 });
                msg.delete({ timeout: 1000 });
              });
            })
            return
          case ("club"):
            if (parts.length > 2) {
              switch (parts[2].toLowerCase()) {
                case ("add"):
                  if (!msg.member.hasPermission('ADMINISTRATOR')) return msg.reply("You don't have permission to perform that command.");
                  if (parts.length !== 5) return msg.reply("Incorrect number of parameters.");

                  emoji = parts[3];
                  roleId = parts[4].substr(3, 18);

                  if (db.get('clubs').map('emoji').value().includes(emoji)) return msg.reply("Club with emoji already added");
                  if (db.get('clubs').map('roleId').value().includes(roleId)) return msg.reply("Club already added");

                  msg.react(emoji).then(reaction => {
                    reaction.remove();
                    msg.guild.roles.fetch(roleId).then(role => {
                      if (role === null || roleId.length === 0) return msg.reply("Invalid role!");
                      db.get('clubs').push({
                        emoji: emoji,
                        roleId: roleId
                      }).write();
                      msg.reply("Added club!");
                      getRoleMessage().then(roleMsg => {
                        updateRoleMsgText(roleMsg);
                        roleMsg.react(emoji);
                      });
                    }).catch(() => {
                      msg.reply("Invalid club!");
                    });
                  }).catch(() => {
                    msg.reply("Invalid emoji!");
                  });
                  return
                case ("remove"):
                  if (!msg.member.hasPermission('ADMINISTRATOR')) return msg.reply("You don't have permission to perform that command.");
                  if (parts.length !== 4) return msg.reply("Incorrect number of parameters.");

                  roleId = parts[3].substr(3, 18);

                  if (db.get('clubs').map('roleId').value().includes(roleId)) {
                    db.get('clubs').remove({ roleId: roleId }).write();
                    msg.reply("Club removed!");
                    getRoleMessage().then(roleMsg => {
                      updateRoleMsgText(roleMsg);
                      checkEmojis(roleMsg);
                    });
                  } else {
                    msg.reply("Can't remove a club that's already not there");
                  }
                  return
                default:
                  msg.reply("Unknown club command");
              }
            } else {
              msg.reply("Club commands:");
            }
            return;
          default:
            msg.reply("Unkown command");
        }
      } else {
        help(msg);
      }
    }
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
	// When we receive a reaction we check if the reaction is partial or not
	if (reaction.partial) {
		// If the message this reaction belongs to was removed the fetching might result in an API error, which we need to handle
		try {
			await reaction.fetch();
		} catch (error) {
			console.error('Something went wrong when fetching the message: ', error);
			// Return as `reaction.message.author` may be undefined/null
			return;
		}
	}
  
  if (reaction.message.id === db.get('roleMsgId').value()) {
    getRoleMessage().then(roleMsg => {
      let emoji = reaction.emoji.name;
      let role = db.get('clubs').find({ emoji: emoji }).value();
      if (!role) return reaction.remove();
      let roleId = role.roleId;

      // Get user reactions
      reaction.users.fetch().then(reactors => {
        reactors.map(reactor => {
          if (reactor.bot) {
            // let nonPresentEmojiIndex = nonPresentEmojis.indexOf(role.emoji);
            // if (nonPresentEmojiIndex > -1) {
            //   nonPresentEmojis.splice(nonPresentEmojiIndex, 1);
            // }
            return;
          }
          roleMsg.guild.members.fetch(reactor.id).then(reactorMember => {
            var hasRole = false;
            reactorMember.roles.cache.map(reactorRole => {
              if (reactorRole.id === roleId) hasRole = true;
            });
            if (hasRole) {
              reactorMember.roles.remove(roleId).then(() => {
                reaction.users.remove(reactor).catch(error => {
                  console.warn("Failed to remove reaction of reactor", error);
                });
              }).catch(error => {
                console.warn("Failed to remove role from reactor", error);
              });
            } else {
              reactorMember.roles.add(roleId).then(() => {
                reaction.users.remove(reactor).catch(error => {
                  console.warn("Failed to remove reaction of reactor", error);
                });
              }).catch(error => {
                console.warn("Failed to add role to reactor", error);
              });
            }
          }).catch(error => {
            console.warn("Failed to get GuildMember of reactor", error);
          });
        });
      }).catch(error => {
        console.warn("Couldn't get reactors", error);
      });
    }).catch(error => {
      console.warn("Listener couldn't get roleMsg", error);
    });
  }
});

function getRoleMessage() {
  return new Promise(function(resolve, reject) {
    let channelId = db.get("roleMsgChannelId").value();
    client.channels.fetch(channelId).then(channel => {
      let msgId = db.get("roleMsgId").value();
      channel.messages.fetch(msgId).then(msg => {
        resolve(msg);
      }).catch(error => {
        console.warn("Couldn't get self role message", error);
        reject("Couldn't get self role message");
      });
    }).catch(error => {
      console.warn("Couldn't get self role message channel", error);
      reject("Couldn't get self role message channel");
    });
  });
}

function updateRoleMsgText(msg) {
  let text = "React to add/remove yourself from a club!";
  let roles = db.get('clubs').value();
  if (roles.length > 0) {
    for (let i = 0 ; i < roles.length; i++) {
      let role = roles[i];
      text += `\n${role.emoji}: <@&${role.roleId}>`;
    }
  }
  msg.edit(text).catch(error => {
    console.warn("Failed to update roles message", error);
  });
}

function checkEmojis(roleMsg) {
  let nonPresentEmojis = db.get('clubs').map('emoji').value();

  roleMsg.reactions.cache.map((reaction) => {
    let emoji = reaction.emoji.name;
    let role = db.get('clubs').find({ emoji: emoji }).value();
    if (!role) return reaction.remove();
    let roleId = role.roleId;

    reaction.users.fetch().then(reactors => {
      reactors.map(reactor => {
        if (reactor.bot) {
          let nonPresentEmojiIndex = nonPresentEmojis.indexOf(role.emoji);
          if (nonPresentEmojiIndex > -1) {
            nonPresentEmojis.splice(nonPresentEmojiIndex, 1);
          }
        }
      });
    });
  });

  // Add roles not present
  for (let i = 0; i < nonPresentEmojis.length; i++) {
    roleMsg.react(nonPresentEmojis[i]).catch(error => {
      console.warn("Bot failed to react to roleMsg with " + nonPresentEmojis[i].emoji, error);
    });
  }
}

function help(msg) {
  msg.reply("Help: ");
}

client.login(TOKEN);