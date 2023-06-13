const axios = require('axios');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { satoshisToFiat } = require('bitcoin-conversion');
const ExifReader = require('exifreader');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Method to extract self-contained metadata from ordinals (If your ordinals have self-contained metadata)
const loadImageMetadata = async (image) => {
  try {
    const { ImageDescription } = await ExifReader.load(image);
    if (!ImageDescription?.description) {
      throw new Error("There is no EXIF metadata to read");
    }
    return JSON.parse(ImageDescription.description);
  } catch (error) {
    throw error;
  }
};

// Discord bot token (consider using environment variables for secrets)
const token = 'DISCORD_BOT_TOKEN';

// The ID of the channel where you want to send messages
const channelId = 'DISCORD_CHANNEL_ID';

// API endpoint for retrieving collection activity
const apiEndpoint = 'https://ordapi.bestinslot.xyz/v1/get_collection_activity/YOUR_PROJECT_NAME/8/1/0';

// Interval for checking the API (in milliseconds)
const interval = 1 * 60 * 1000; // 1 minute

// Variables to track last checked timestamp and first pass
let lastCheckedTimestamp = null;
let isFirstPass = true;

// Checks the API for new sales and sends them to the channel
async function checkAndSendSales(channel) {
  try {
    console.log('Running sales check');
    const response = await axios.get(apiEndpoint);
    const salesData = response.data;

    let filteredSales = [];

    if (isFirstPass) {
      filteredSales = salesData.slice(0, 1); // Get the first 1 sale on the first pass, why? don't worry about it
      isFirstPass = false;
    } else {
      if (lastCheckedTimestamp) {
        filteredSales = salesData.filter(sale => {
          const saleTimestamp = new Date(sale.ts).getTime();
          return saleTimestamp > lastCheckedTimestamp;
        });
      } else {
        filteredSales = salesData;
      }
    }

    if (filteredSales.length > 0) {
      for (const sale of filteredSales) {
        const btcValue = sale.psbt_price / 100000000;
        const paymentInUsd = await satoshisToFiat(sale.psbt_price.toString(), 'USD');
        const roundedPayment = parseFloat(paymentInUsd).toFixed(2).toString();
        // Extract self-contained metadata from ordinals (If your ordinal has self-contained metadata)
        const ordinalData = await loadImageMetadata(`https://api.hiro.so/ordinals/v1/inscriptions/${sale.inscription_id}/content`);
        // Builds the embedded message you'll send to discord
        const embed = new EmbedBuilder()
          .setTitle(`${ordinalData.metadata.name} SOLD`)
          .setColor(0x00FFFF)
          .addFields({ name: 'Price', value: `${btcValue} BTC ($${roundedPayment})` })
          .setThumbnail(`https://api.hiro.so/ordinals/v1/inscriptions/${sale.inscription_id}/content`)
          .setFooter({ text: 'Built by @BitcoinBurials' })
          .setURL(`https://bitcoinburials.com/tools/metadata/${sale.inscription_id}`);
        // Send the embedded message to the desired channel
        await channel.send({ embeds: [embed] });
      }
    }

    // Update the last checked timestamp to the latest sale timestamp
    if (filteredSales.length > 0) {
      const latestSaleTimestamp = new Date(filteredSales[0].ts).getTime();
      lastCheckedTimestamp = latestSaleTimestamp;
      console.log(lastCheckedTimestamp);
    }
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

// Schedule the bot
setInterval(async () => {
  const channel = await client.channels.fetch(channelId);
  await checkAndSendSales(channel);
}, interval);

// Start the initial check
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  const channel = await client.channels.fetch(channelId);
  await checkAndSendSales(channel);
});

client.login(token);
