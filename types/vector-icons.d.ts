declare module "@expo/vector-icons" {
  import * as React from "react";
  import { TextProps } from "react-native";

  interface IconProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
  }

  export class Ionicons extends React.Component<IconProps> {}
  export class MaterialIcons extends React.Component<IconProps> {}
  export class Feather extends React.Component<IconProps> {}
  export class FontAwesome extends React.Component<IconProps> {}
  export class AntDesign extends React.Component<IconProps> {}
}
