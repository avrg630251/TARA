/** Merges env-based Android Maps key and location plugin into Expo config from app.json. */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "TARA uses your location to show your position on the map preview.",
      },
    ],
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
        ...(process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY
          ? {
              iosGoogleMapsApiKey:
                process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY,
            }
          : {}),
      },
    ],
  ],
  ios: {
    ...config.ios,
    infoPlist: {
      ...config.ios?.infoPlist,
      NSLocationWhenInUseUsageDescription:
        "TARA uses your location to show your position on the map preview.",
    },
  },
});
