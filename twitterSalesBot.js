const axios = require('axios');
const { satoshisToFiat } = require('bitcoin-conversion');
const ExifReader = require('exifreader');
const { TwitterApi } = require('twitter-api-v2');

// Instantiate Twitter client with your API credentials
// Consider using environment variables to store the secrets
const twitterClient = new TwitterApi({
    appKey: '',
    appSecret: '',
    accessToken: '',
    accessSecret: ''
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

// API endpoint
const apiEndpoint = 'https://ordapi.bestinslot.xyz/v1/get_collection_activity/YOUR_PROJECT_NAME/8/1/0';

// Interval for checking the API
const interval = 1 * 60 * 1000; // 1 minute

// Variable to store the last checked timestamp
let lastCheckedTimestamp = null;
let isFirstPass = true;

// Checks the API for new sales and sends tweets
async function checkAndSendSales() {
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

        try {
          // Send tweet with interpolated string
          await twitterClient.v2.tweet(`${ordinalData.metadata.name}\n\nSold for ${btcValue} BTC ($${roundedPayment})`);
        } catch (error) {
          console.error('Error posting tweet:', error);
        }
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
  await checkAndSendSales();
}, interval);

// Start the initial check
console.log('Starting sales check...');
checkAndSendSales();
