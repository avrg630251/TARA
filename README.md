# TARA-neta

**TARA-neta** (derived from *TARA: Travel and Ride Anywhere*) is a location-aware public transportation navigation app customized to guide commuters directly to **De La Salle Araneta University (DLSAU)**. While originally envisioned as a general commuter platform, this iteration is specifically scoped to master travel and transit connections to DLSAU, accommodating real-world local transport realities like jeepneys, buses, and tricycles.

The app is built to act like a smarter travel companion, similar in spirit to Google Maps or Waze, but with a stronger focus on local public transit guidance: what vehicle to board, placards or colors to look for, alighting phrases to tell drivers, where to transfer, and how much fares will cost.

## Project vision

Many commuters, especially in urban areas, struggle with:

- uncertainty about which jeepney route to take
- unclear transfer points and stop locations
- limited digital tools that reflect local transit realities
- difficulty comparing routes based on fare, duration, and convenience

TARA aims to make commuting easier by giving users a route-planning experience that fits local public transportation behavior. It supports better trip decisions, reduces confusion, and makes everyday travel more accessible and efficient.

## What TARA does

TARA helps users:

- search for a route from Point A to Point B
- identify the best public transportation option, including jeepney-based routes
- view estimated travel time and fare information
- compare routes by speed, affordability, and transfer count
- choose between route options based on user preferences
- save favorite places and recent trips
- get map-based trip visualization for easier route understanding
- use location-based suggestions for nearby destinations and transport stops

## Core features

### Route planning
The app allows users to enter an origin and destination and find travel options that match their trip needs. It can recommend routes that involve jeepneys and other available transit options.

### Transit comparison
Users can compare different route options based on:

- estimated trip duration
- total fare
- number of transfers
- route simplicity and convenience
- fastest vs cheapest route preference

### Location-aware navigation experience
TARA uses map and location features to improve trip planning by:

- identifying the user’s current position
- suggesting nearby places and popular travel destinations
- showing trip paths on a map
- supporting better route context and visual understanding

### Trip planning for everyday commuting
The app is especially useful for daily or recurring commuting scenarios, where users need practical guidance rather than a generic driving route.

### User personalization
Future-friendly features in the app include:

- favorite or saved destinations
- trip history
- commuter profiles
- preference-based route suggestions
- customized route filtering for fare or speed

## Why this project matters

TARA is built around the realities of local transportation use. In many cities, commuters do not rely on a single fixed transit system but instead combine different modes, informal routes, and transfer-heavy journeys. A route-planning app should reflect that reality.

This project is not just a navigation app—it is a commuter-first mobility tool designed to make everyday transit more understandable and easier to use.

## Tech stack

TARA is built using modern mobile app and web technologies, including:

- React Native
- Expo
- Expo Router
- TypeScript
- Google Maps / map-based location services
- Supabase for backend data and app storage
- Async storage for local user data
- geolocation and transit route logic integration

## Project structure

- `app/` — app screens and route pages
- `components/` — reusable UI and map components
- `contexts/` — app state and travel context
- `lib/` — transit logic, map utilities, and route generation helpers
- `db/` — database and transit-related SQL assets
- `docs/` — planning and routing strategy documentation
- `assets/` — images, icons, and static app resources

## How the app works

1. The user enters a starting point and a destination.
2. The app checks the user’s location and nearby transit context.
3. It evaluates route options using transit and map data.
4. It ranks routes based on travel time, fare, and convenience.
5. The user chooses the route that best matches their needs.
6. The trip is shown visually on the map with relevant route details.

## Example use case

A user wants to travel from one barangay to another using public transportation. Instead of guessing which jeepney line to ride or which stop to get off at, TARA can suggest a route such as:

- ride Jeepney Route X from point A to a transfer point
- transfer to another jeepney or public transport line
- walk a short distance to the destination
- receive an estimated fare and travel time

This makes the system more useful for real-world daily travel compared with standard point-to-point directions alone.

## Getting started

### Prerequisites

Make sure the following are installed on the developer machine:

- Node.js LTS (recommended version 20 or newer)
- npm (comes with Node.js)
- Git
- VS Code (recommended for editing and terminal use)
- Android Studio with Android SDK (for Android emulator testing)
- Xcode (for iOS simulator testing on Mac only)
- Expo Go app on a mobile device (optional but useful for testing)

### Check installed tools

```bash
node -v
npm -v
git --version
```

If these commands work, the environment is set up correctly.

### Install project dependencies

From the project root:

```bash
npm install
```

If the project is missing an installation or lockfile is outdated, you can reinstall cleanly:

```bash
rm -rf node_modules package-lock.json
npm install
```

On Windows PowerShell, use:

```powershell
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install
```

### Start the app

```bash
npx expo start
```

You may also use:

```bash
npm start
```

### Run on different platforms

#### Android emulator

```bash
npx expo start --android
```

#### iOS simulator (Mac only)

```bash
npx expo start --ios
```

#### Web preview

```bash
npx expo start --web
```

#### Run a production web build

```bash
npm run build:web
```

### Linting

```bash
npm run lint
```

### Reset the project structure

If the template needs to be reset:

```bash
npm run reset-project
```

## Environment variables

### Local environment file

Create a `.env` file in the root of the project based on `.env.example`.

Example:

```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

This file should not be committed to Git, as it may contain sensitive API keys or local development values.

### Important notes

- Keep `.env` local to each developer machine.
- Do not expose secret keys in public repositories.
- If the project uses Supabase or other services, add those environment keys to `.env` as needed.

## Recommended developer workflow

1. Clone the repository
2. Install dependencies
3. Create a local `.env` file
4. Start Expo
5. Run the app in emulator, simulator, or Expo Go
6. Make changes in the relevant project files
7. Commit changes with clear messages
8. Push to the feature branch and open a pull request

## Example commands for team members

```bash
git clone https://github.com/your-username/TARA.git
cd TARA
npm install
cp .env.example .env
npx expo start
```

If the project is already cloned and dependencies are present:

```bash
git pull
npm install
npx expo start
```

## Environment variables

Some features may depend on environment variables for map or transit services. Use a local `.env` file based on the provided `.env.example` file.

Example:

```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

## Future goals

TARA is designed to grow into a more complete commuter platform. Possible future improvements include:

- more transport modes beyond jeepneys
- improved route accuracy with local transit data
- real-time traffic and transit updates
- user accounts and saved trip preferences
- advanced transit analytics and route optimization
- better accessibility support for commuters with mobility needs

## Project status

This project is currently in development as a smart local transit and navigation app focused on public transportation guidance in a jeepney-heavy context.

## License

This project is for academic and collaborative development purposes.

## Team

TARA is developed as a thesis and collaborative project focused on improving local transportation access, mobility, and commuter experience.
