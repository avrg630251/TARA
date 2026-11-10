import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

export type TransitVehicleIconType = "tricycle" | "jeepney" | "bus" | "walk";

type Props = {
  type: TransitVehicleIconType;
  size?: number;
  color?: string;
};

/**
 * Renders distinct Philippine transit vehicle icons:
 * - "tricycle": Philippine motorized tricycle with passenger sidecar canopy & 3 wheel stance
 * - "jeepney": Iconic Philippine jeepney with roof signboard, split front windshield, and grille
 * - "bus": Standard transit bus
 * - "walk": Pedestrian walk icon
 */
export function TransitVehicleIcon({
  type,
  size = 20,
  color = "#1B4332",
}: Props) {
  if (type === "walk") {
    return <Ionicons name="walk-outline" size={size} color={color} />;
  }

  if (type === "bus") {
    return <Ionicons name="bus" size={size} color={color} />;
  }

  const s = size / 20;

  if (type === "tricycle") {
    // Philippine Tricycle (Motorcycle + Covered Passenger Sidecar + 3 Wheels)
    const stroke = Math.max(1.4, 1.7 * s);
    return (
      <View
        style={[
          styles.iconBox,
          { width: Math.round(22 * s), height: Math.round(20 * s) },
        ]}
        accessibilityLabel="Tricycle icon"
      >
        {/* Sidecar Roof Canopy */}
        <View
          style={{
            position: "absolute",
            top: 2 * s,
            left: 2 * s,
            width: 12 * s,
            height: 4 * s,
            borderTopLeftRadius: 4 * s,
            borderTopRightRadius: 5 * s,
            backgroundColor: color,
          }}
        />
        {/* Sidecar Cabin Frame / Windshield Support */}
        <View
          style={{
            position: "absolute",
            top: 5 * s,
            left: 2.5 * s,
            width: 11 * s,
            height: 7.5 * s,
            borderWidth: stroke,
            borderColor: color,
            borderBottomLeftRadius: 2 * s,
            borderBottomRightRadius: 3 * s,
          }}
        />
        {/* Sidecar Lower Body Panel */}
        <View
          style={{
            position: "absolute",
            top: 9.2 * s,
            left: 2.5 * s,
            width: 11 * s,
            height: 3.5 * s,
            backgroundColor: color,
            borderBottomLeftRadius: 2 * s,
            borderBottomRightRadius: 2.5 * s,
          }}
        />
        {/* Motorcycle Handlebar & Front Fork */}
        <View
          style={{
            position: "absolute",
            top: 4.5 * s,
            left: 14.5 * s,
            width: stroke,
            height: 8.5 * s,
            backgroundColor: color,
            transform: [{ rotate: "-18deg" }],
          }}
        />
        {/* Handlebar Grip & Headlight */}
        <View
          style={{
            position: "absolute",
            top: 4.2 * s,
            left: 12.8 * s,
            width: 4.2 * s,
            height: stroke,
            backgroundColor: color,
            borderRadius: 1 * s,
          }}
        />
        {/* Front Fender */}
        <View
          style={{
            position: "absolute",
            top: 9.8 * s,
            left: 14 * s,
            width: 5.5 * s,
            height: stroke,
            backgroundColor: color,
            borderTopRightRadius: 3 * s,
          }}
        />
        {/* Left/Rear Sidecar Wheel */}
        <View
          style={{
            position: "absolute",
            bottom: 1.5 * s,
            left: 3 * s,
            width: 5.2 * s,
            height: 5.2 * s,
            borderRadius: 2.6 * s,
            borderWidth: stroke,
            borderColor: color,
            backgroundColor: "transparent",
          }}
        />
        {/* Center Drive Wheel */}
        <View
          style={{
            position: "absolute",
            bottom: 1.5 * s,
            left: 9.2 * s,
            width: 5.2 * s,
            height: 5.2 * s,
            borderRadius: 2.6 * s,
            borderWidth: stroke,
            borderColor: color,
            backgroundColor: "transparent",
          }}
        />
        {/* Front Motorcycle Wheel */}
        <View
          style={{
            position: "absolute",
            bottom: 1.5 * s,
            left: 15.2 * s,
            width: 5.2 * s,
            height: 5.2 * s,
            borderRadius: 2.6 * s,
            borderWidth: stroke,
            borderColor: color,
            backgroundColor: "transparent",
          }}
        />
      </View>
    );
  }

  // Philippine Jeepney Icon (Roof Signboard, Split Windshield, Front Grille & Headlights)
  const stroke = Math.max(1.4, 1.65 * s);
  return (
    <View
      style={[
        styles.iconBox,
        { width: Math.round(22 * s), height: Math.round(20 * s) },
      ]}
      accessibilityLabel="Jeepney icon"
    >
      {/* Iconic Jeepney Roof Signboard / Crown */}
      <View
        style={{
          position: "absolute",
          top: 1.2 * s,
          left: 5.5 * s,
          width: 11 * s,
          height: 2.8 * s,
          borderTopLeftRadius: 2.5 * s,
          borderTopRightRadius: 2.5 * s,
          backgroundColor: color,
        }}
      />
      {/* Main Jeepney Body */}
      <View
        style={{
          position: "absolute",
          top: 3.6 * s,
          left: 2.5 * s,
          width: 17 * s,
          height: 11.2 * s,
          borderRadius: 3 * s,
          borderWidth: stroke,
          borderColor: color,
        }}
      >
        {/* Split Windshield Row */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingHorizontal: 1.5 * s,
            paddingTop: 1.2 * s,
            height: 4.6 * s,
          }}
        >
          <View
            style={{
              flex: 1,
              borderWidth: Math.max(1, 1.1 * s),
              borderColor: color,
              borderRadius: 1 * s,
              marginRight: 1 * s,
            }}
          />
          <View
            style={{
              flex: 1,
              borderWidth: Math.max(1, 1.1 * s),
              borderColor: color,
              borderRadius: 1 * s,
              marginLeft: 1 * s,
            }}
          />
        </View>
        {/* Hood & Front Grille Bar with Round Headlights */}
        <View
          style={{
            flex: 1,
            marginTop: 1 * s,
            backgroundColor: color,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 2 * s,
          }}
        >
          {/* Left Headlight */}
          <View
            style={{
              width: 2.2 * s,
              height: 2.2 * s,
              borderRadius: 1.1 * s,
              backgroundColor: "#ffffff",
            }}
          />
          {/* Jeepney Grille Bars */}
          <View style={{ flexDirection: "row", gap: 1.2 * s }}>
            <View
              style={{
                width: 1 * s,
                height: 2.4 * s,
                backgroundColor: "#ffffff",
                borderRadius: 0.5 * s,
              }}
            />
            <View
              style={{
                width: 1 * s,
                height: 2.4 * s,
                backgroundColor: "#ffffff",
                borderRadius: 0.5 * s,
              }}
            />
            <View
              style={{
                width: 1 * s,
                height: 2.4 * s,
                backgroundColor: "#ffffff",
                borderRadius: 0.5 * s,
              }}
            />
          </View>
          {/* Right Headlight */}
          <View
            style={{
              width: 2.2 * s,
              height: 2.2 * s,
              borderRadius: 1.1 * s,
              backgroundColor: "#ffffff",
            }}
          />
        </View>
      </View>
      {/* Front Bumper */}
      <View
        style={{
          position: "absolute",
          bottom: 4.2 * s,
          left: 1.5 * s,
          width: 19 * s,
          height: 1.8 * s,
          borderRadius: 1 * s,
          backgroundColor: color,
        }}
      />
      {/* Left Wheel */}
      <View
        style={{
          position: "absolute",
          bottom: 1.2 * s,
          left: 4 * s,
          width: 3.4 * s,
          height: 3.4 * s,
          borderRadius: 1.2 * s,
          backgroundColor: color,
        }}
      />
      {/* Right Wheel */}
      <View
        style={{
          position: "absolute",
          bottom: 1.2 * s,
          right: 4 * s,
          width: 3.4 * s,
          height: 3.4 * s,
          borderRadius: 1.2 * s,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
});
