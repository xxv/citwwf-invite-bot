require('dotenv').config();
const {
  Client, GatewayIntentBits, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { google } = require('googleapis');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Google Sheets Auth Setup
const auth = new google.auth.GoogleAuth({
  keyFile: './service-account.json', 
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    // Register an admin-only command to spawn the button
    await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), {
      body: [{
        name: 'setup-verify',
        description: 'Admin only: Spawns the verification button in the current channel',
      }],
    });
    console.log('Setup command registered.');
  } catch (error) {
    console.error('Failed to register setup command:', error);
  }
});

client.on('interactionCreate', async interaction => {
  
  // 1. Handle the setup command (Spawns the persistent button)
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-verify') {
    const verifyButton = new ButtonBuilder()
      .setCustomId('verify_button')
      .setLabel('Verify Token')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎟️'); 

    const row = new ActionRowBuilder().addComponents(verifyButton);

    await interaction.reply({ 
      content: "Welcome to the CITWWF lobby! Click the button below and enter the token you received in your email to join. You will only receive an email if you have already filled out this year's intake form.", 
      components: [row] 
    });
    return;
  }

  // 2. Handle the button click (Spawns the pop-up modal)
  if (interaction.isButton() && interaction.customId === 'verify_button') {
    const modal = new ModalBuilder()
      .setCustomId('verify_modal')
      .setTitle('Event Verification');

    const tokenInput = new TextInputBuilder()
      .setCustomId('token_input')
      .setLabel("What is your 6-character token?")
      .setStyle(TextInputStyle.Short)
      .setMinLength(6)
      .setMaxLength(6)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(tokenInput);
    modal.addComponents(row);

    // Show the modal to the user
    await interaction.showModal(modal);
    return;
  }

  // 3. Handle the modal submission (Validates token with Google Sheets)
  if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
    const tokenInput = interaction.fields.getTextInputValue('token_input').trim().toUpperCase();
    
    // Defer the reply so the modal closes immediately while we check the sheet
    await interaction.deferReply({ ephemeral: true });

    try {
      const sheets = google.sheets({ version: 'v4', auth });
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Attendees!A:E', 
      });

      const rows = response.data.values;
      let targetRowIndex = -1;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const sheetToken = row[3];
        const status = row[4];

        if (sheetToken === tokenInput) {
          if (status === 'Claimed') {
            return interaction.editReply('This token has already been claimed.');
          }
          targetRowIndex = i;
          break;
        }
      }

      if (targetRowIndex === -1) {
        return interaction.editReply('Invalid token. Please check your email and try again.');
      }

      // Token is valid. Assign the role.
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.add(process.env.ROLE_ID);
      await member.roles.remove(process.env.LOBBY_ROLE_ID);

      // Update the Google Sheet
      const rowNumber = targetRowIndex + 1; 
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SHEET_ID,
        range: `Attendees!E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [['Claimed']] },
      });

      await interaction.editReply('Verification successful! Welcome to CITWWF.');

    } catch (error) {
      console.error('Verification error:', error);
      await interaction.editReply('An error occurred during verification. Please contact an admin.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
