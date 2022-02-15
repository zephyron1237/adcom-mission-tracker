// This is the configuration data for ADVENTURE COMMUNIST

var POWERS = ['K', 'M', 'B', 'T', 'AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ', 'KK', 'LL', 'MM', 'NN', 'OO', 'PP', 'QQ', 'RR', 'SS', 'TT', 'UU', 'VV', 'WW', 'XX', 'YY', 'ZZ', 'AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ', 'KFC', 'LLL', 'MMM', 'NNN', 'OOO', 'PPP', 'QQQ', 'RRR', 'SSS', 'TTT', 'UUU', 'VVV', 'WWW', 'XXX', 'YYY', 'ZZZ', 'AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF', 'GGGG', 'HHHH', 'IIII', 'JJJJ', 'KKKK', 'LLLL', 'MMMM', 'NNNN', 'OOOO', 'PPPP', 'QQQQ', 'RRRR', 'SSSS', 'TTTT', 'UUUU', 'VVVV', 'WWWW', 'XXXX', 'YYYY', 'ZZZZ', 'AAAAA', 'BBBBB', 'CCCCC', 'DDDDD', 'EEEEE', 'FFFFF', 'GGGGG', 'HHHHH', 'IIIII', 'JJJJJ', 'KKKKK', 'LLLLL', 'MMMMM', 'NNNNN', 'OOOOO', 'PPPPP', 'QQQQQ', 'RRRRR', 'SSSSS', 'TTTTT', 'UUUUU', 'VVVVV', 'WWWWW', 'XXXXX', 'YYYYY', 'ZZZZZ'];

// These are used for the event's title in the top-left nav menu.
// Typically, the ThemeId is used directly, but some themes are poorly-named.
var THEME_ID_TITLE_OVERRIDES = {
  "main": "Motherland",
  "attack": "Oil",
  "defense": "Shield",
  "potatofactory": "Factory",
};

// For game-specific documentation and social channels
var SOCIAL_HELP_URLS = {
  "faq": "https://docs.google.com/document/d/1a314ZQM1f4ggFCtsC__Nb3B_1Hrc02cS0ZhY7_T08v8/",
  "discord": "https://discord.gg/VPa4WTM",
  "reddit": "https://reddit.com/r/AdventureCommunist/",
}

// So that AdCom can have "CurrentMode" and Ages can have "Ages-CurrentMode"
var GAME_SAVE_KEY_PREFIX = "";

// If not undefined, will show a datamining warning at the top of the Tracker
var DATAMINE_WARNING_MIN_RANK = undefined; // For motherland
var DATAMINE_WARNING_THEME_ID = undefined; // For events