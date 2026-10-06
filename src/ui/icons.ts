import type { Icon } from "phosphor-react-native";

/**
 * 쓰는 아이콘만 개별 파일에서 가져온다. 패키지 루트에서 가져오면 아이콘 1,500여 개가 전부 번들에 들어간다.
 * 개별 파일은 TS 원본(.tsx)이라 import로 가져오면 tsc가 패키지 내부까지 검사하므로 require로 받고 타입만 붙인다.
 * 아이콘은 Phosphor 한 가족만 쓴다.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
export const ArrowRightIcon: Icon = require("phosphor-react-native/src/icons/ArrowRight").ArrowRightIcon;
export const BandaidsIcon: Icon = require("phosphor-react-native/src/icons/Bandaids").BandaidsIcon;
export const BarbellIcon: Icon = require("phosphor-react-native/src/icons/Barbell").BarbellIcon;
export const BasketIcon: Icon = require("phosphor-react-native/src/icons/Basket").BasketIcon;
export const BedIcon: Icon = require("phosphor-react-native/src/icons/Bed").BedIcon;
export const BreadIcon: Icon = require("phosphor-react-native/src/icons/Bread").BreadIcon;
export const CaretRightIcon: Icon = require("phosphor-react-native/src/icons/CaretRight").CaretRightIcon;
export const ChalkboardTeacherIcon: Icon = require("phosphor-react-native/src/icons/ChalkboardTeacher").ChalkboardTeacherIcon;
export const CoinsIcon: Icon = require("phosphor-react-native/src/icons/Coins").CoinsIcon;
export const CompassIcon: Icon = require("phosphor-react-native/src/icons/Compass").CompassIcon;
export const HammerIcon: Icon = require("phosphor-react-native/src/icons/Hammer").HammerIcon;
export const HandCoinsIcon: Icon = require("phosphor-react-native/src/icons/HandCoins").HandCoinsIcon;
export const HeartIcon: Icon = require("phosphor-react-native/src/icons/Heart").HeartIcon;
export const LightningIcon: Icon = require("phosphor-react-native/src/icons/Lightning").LightningIcon;
export const LockSimpleIcon: Icon = require("phosphor-react-native/src/icons/LockSimple").LockSimpleIcon;
export const MedalIcon: Icon = require("phosphor-react-native/src/icons/Medal").MedalIcon;
export const MoonStarsIcon: Icon = require("phosphor-react-native/src/icons/MoonStars").MoonStarsIcon;
export const PlantIcon: Icon = require("phosphor-react-native/src/icons/Plant").PlantIcon;
export const SignOutIcon: Icon = require("phosphor-react-native/src/icons/SignOut").SignOutIcon;
export const SkullIcon: Icon = require("phosphor-react-native/src/icons/Skull").SkullIcon;
export const StorefrontIcon: Icon = require("phosphor-react-native/src/icons/Storefront").StorefrontIcon;
export const SunHorizonIcon: Icon = require("phosphor-react-native/src/icons/SunHorizon").SunHorizonIcon;
export const SunIcon: Icon = require("phosphor-react-native/src/icons/Sun").SunIcon;
export const TargetIcon: Icon = require("phosphor-react-native/src/icons/Target").TargetIcon;
export const TreeIcon: Icon = require("phosphor-react-native/src/icons/Tree").TreeIcon;
export const TrendUpIcon: Icon = require("phosphor-react-native/src/icons/TrendUp").TrendUpIcon;
export const WarningIcon: Icon = require("phosphor-react-native/src/icons/Warning").WarningIcon;

export type { Icon };
