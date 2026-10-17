# 1103環境の上位10デッキ（参照用の元カード英語名で記述）。
# 形式: (枚数, "元カード英語名")。build.py がカードDBと突き合わせて検証する。

# 汎用の罠ギミック（多くのデッキで共通）
TRAPS_STD = [
    (2, "Bottomless Trap Hole"), (2, "Solemn Warning"), (1, "Solemn Judgment"),
    (1, "Torrential Tribute"), (1, "Mirror Force"),
]

DECKS = {
"rabbit": {
  "main": [
    (3, "Rescue Rabbit"), (3, "Sabersaurus"), (2, "Kabazauls"), (2, "Effect Veiler"),
    (2, "Thunder King Rai-Oh"), (2, 'Maxx "C"'), (1, "Breaker the Magical Warrior"),
    (1, "Gorz the Emissary of Darkness"), (1, "Necro Gardna"),
    (1, "Monster Reborn"), (1, "Dark Hole"), (2, "Mystical Space Typhoon"), (1, "Book of Moon"),
    (1, "Smashing Ground"), (1, "Creature Swap"), (2, "Forbidden Chalice"), (1, "Pot of Duality"),
    *TRAPS_STD, (2, "Dimensional Prison"), (1, "Compulsory Evacuation Device"), (2, "Dark Bribe"),
    (1, "Royal Oppression"),
  ],
  "extra": [
    (3, "Evolzar Laggia"), (2, "Number 39: Utopia"), (1, "Number 34: Terror-Byte"),
  ],
},
"agent": {
  "main": [
    (3, "The Agent of Creation - Venus"), (3, "Mystical Shine Ball"), (3, "The Agent of Mystery - Earth"),
    (3, "Master Hyperion"), (2, "Archlord Kristya"), (1, "Honest"), (1, "Gorz the Emissary of Darkness"),
    (2, "Effect Veiler"), (2, 'Maxx "C"'),
    (2, "The Sanctuary in the Sky"), (2, "Valhalla, Hall of the Fallen"), (1, "Monster Reborn"),
    (1, "Dark Hole"), (2, "Mystical Space Typhoon"), (1, "Book of Moon"), (1, "Pot of Duality"),
    *TRAPS_STD, (2, "Dimensional Prison"), (1, "Compulsory Evacuation Device"),
  ],
  "extra": [
    (2, "Number 39: Utopia"), (2, "Number 17: Leviathan Dragon"), (1, "Number 30: Acid Golem of Destruction"),
    (1, "Number 34: Terror-Byte"), (1, "Number 20: Giga-Brilliant"),
  ],
},
"hero": {
  "main": [
    (1, "Elemental HERO Stratos"), (2, "Destiny HERO - Malicious"), (2, "Elemental HERO Prisma"),
    (2, "Elemental HERO Ocean"), (2, "Elemental HERO Neos Alius"), (1, "Honest"),
    (1, "Gorz the Emissary of Darkness"), (2, "Effect Veiler"), (2, 'Maxx "C"'), (1, "Necro Gardna"),
    (3, "E - Emergency Call"), (2, "A Hero Lives"), (2, "Miracle Fusion"), (1, "Reinforcement of the Army"),
    (1, "Monster Reborn"), (1, "Dark Hole"), (2, "Mystical Space Typhoon"), (1, "Book of Moon"),
    *TRAPS_STD, (2, "Dimensional Prison"), (1, "Compulsory Evacuation Device"), (1, "Hero Signal"),
  ],
  "extra": [
    (2, "Elemental HERO Absolute Zero"), (2, "Elemental HERO Escuridao"), (1, "Elemental HERO The Shining"),
    (1, "Elemental HERO Great Tornado"), (2, "Number 39: Utopia"), (1, "Number 34: Terror-Byte"),
    (1, "Number 25: Force Focus"),
  ],
},
"tg_gadget": {
  "main": [
    (3, "Red Gadget"), (3, "Green Gadget"), (2, "Yellow Gadget"), (3, "T.G. Striker"), (2, "T.G. Warwolf"),
    (1, "T.G. Cyber Magician"), (2, "Effect Veiler"), (2, 'Maxx "C"'),
    (1, "Monster Reborn"), (1, "Dark Hole"), (2, "Mystical Space Typhoon"), (1, "Book of Moon"),
    (2, "Pot of Duality"), (1, "Smashing Ground"), (2, "Forbidden Chalice"),
    *TRAPS_STD, (2, "Dimensional Prison"), (1, "Compulsory Evacuation Device"), (1, "Dark Bribe"),
    (1, "Call of the Haunted"),
  ],
  "extra": [
    (2, "T.G. Hyper Librarian"), (1, "T.G. Wonder Magician"), (1, "Ally of Justice Catastor"),
    (1, "Brionac, Dragon of the Ice Barrier"), (1, "Black Rose Dragon"), (1, "Stardust Dragon"),
    (1, "Trishula, Dragon of the Ice Barrier"), (1, "T.G. Blade Blaster"), (1, "Arcanite Magician"),
    (1, "Scrap Dragon"), (2, "Number 39: Utopia"), (1, "Number 34: Terror-Byte"),
    (1, "Number 17: Leviathan Dragon"),
  ],
},
"debris_plant": {
  "main": [
    (2, "Debris Dragon"), (1, "Dandylion"), (2, "Lonefire Blossom"), (1, "Glow-Up Bulb"), (1, "Spore"),
    (1, "Plaguespreader Zombie"), (3, "Junk Synchron"), (2, "Doppelwarrior"), (2, "Armageddon Knight"),
    (1, "Card Trooper"), (1, "Sangan"), (2, "Effect Veiler"), (2, 'Maxx "C"'),
    (1, "One for One"), (1, "Foolish Burial"), (1, "Monster Reborn"), (1, "Dark Hole"),
    (2, "Mystical Space Typhoon"), (1, "Book of Moon"), (1, "Pot of Duality"),
    *TRAPS_STD, (2, "Dimensional Prison"), (1, "Compulsory Evacuation Device"), (1, "Call of the Haunted"),
  ],
  "extra": [
    (1, "Stardust Dragon"), (1, "Black Rose Dragon"), (1, "Junk Destroyer"), (1, "Junk Warrior"),
    (1, "Ally of Justice Catastor"), (1, "Trishula, Dragon of the Ice Barrier"),
    (1, "Brionac, Dragon of the Ice Barrier"), (1, "Formula Synchron"), (1, "Shooting Star Dragon"),
    (1, "Ancient Fairy Dragon"), (1, "Scrap Dragon"), (1, "Armory Arm"), (1, "Red Dragon Archfiend"),
    (1, "Number 39: Utopia"), (1, "Number 17: Leviathan Dragon"),
  ],
},
"quick_plant": {
  "main": [
    (3, "Quickdraw Synchron"), (2, "Level Eater"), (1, "Dandylion"), (2, "Lonefire Blossom"),
    (1, "Glow-Up Bulb"), (1, "Spore"), (1, "Plaguespreader Zombie"), (1, "Card Trooper"), (1, "Sangan"),
    (2, "Effect Veiler"), (2, 'Maxx "C"'), (1, "Doppelwarrior"), (1, "Junk Synchron"),
    (2, "Tuning"), (1, "One for One"), (1, "Foolish Burial"), (1, "Monster Reborn"), (1, "Dark Hole"),
    (2, "Mystical Space Typhoon"), (1, "Book of Moon"),
    *TRAPS_STD, (2, "Dimensional Prison"), (1, "Compulsory Evacuation Device"), (1, "Call of the Haunted"),
    (1, "Dark Bribe"),
  ],
  "extra": [
    (1, "Stardust Dragon"), (1, "Black Rose Dragon"), (1, "Junk Destroyer"), (1, "Junk Warrior"),
    (1, "Ally of Justice Catastor"), (1, "Trishula, Dragon of the Ice Barrier"),
    (1, "Brionac, Dragon of the Ice Barrier"), (1, "Formula Synchron"), (1, "Shooting Star Dragon"),
    (1, "Ancient Fairy Dragon"), (1, "Scrap Dragon"), (1, "Magical Android"), (1, "Red Dragon Archfiend"),
    (1, "Number 39: Utopia"), (1, "Number 17: Leviathan Dragon"),
  ],
},
"six_samurai": {
  "main": [
    (3, "Legendary Six Samurai - Kizan"), (3, "Legendary Six Samurai - Kageki"),
    (2, "Legendary Six Samurai - Mizuho"), (2, "Legendary Six Samurai - Shinai"),
    (1, "Legendary Six Samurai - Enishi"), (1, "Grandmaster of the Six Samurai"),
    (1, "Kagemusha of the Six Samurai"), (1, "The Six Samurai - Zanji"), (1, "Elder of the Six Samurai"),
    (2, "Effect Veiler"),
    (1, "Gateway of the Six"), (3, "Six Samurai United"), (3, "Shien's Smoke Signal"),
    (1, "Reinforcement of the Army"), (1, "Monster Reborn"), (1, "Dark Hole"),
    (2, "Mystical Space Typhoon"), (1, "Book of Moon"),
    (2, "Musakani Magatama"), *TRAPS_STD[:3], (1, "Mirror Force"),
    (1, "Dimensional Prison"), (1, "Compulsory Evacuation Device"),
  ],
  "extra": [
    (2, "Legendary Six Samurai - Shi En"), (1, "Brionac, Dragon of the Ice Barrier"),
    (1, "Ally of Justice Catastor"), (1, "Black Rose Dragon"), (1, "Stardust Dragon"),
    (1, "Trishula, Dragon of the Ice Barrier"), (2, "Number 39: Utopia"),
    (1, "Number 17: Leviathan Dragon"), (1, "Number 30: Acid Golem of Destruction"),
    (1, "Number 34: Terror-Byte"),
  ],
},
"dark_world": {
  "main": [
    (3, "Grapha, Dragon Lord of Dark World"), (2, "Sillva, Warlord of Dark World"),
    (1, "Goldd, Wu-Lord of Dark World"), (3, "Beiige, Vanguard of Dark World"),
    (1, "Snoww, Unlight of Dark World"), (2, "Broww, Huntsman of Dark World"), (2, "Dark Grepher"),
    (1, "Tragoedia"), (2, 'Maxx "C"'), (1, "Effect Veiler"),
    (3, "Dark World Dealings"), (2, "Gateway to Dark World"), (1, "Card Destruction"),
    (1, "Allure of Darkness"), (1, "Foolish Burial"), (1, "Monster Reborn"), (1, "Dark Hole"),
    (2, "Mystical Space Typhoon"), (2, "Hand Destruction"), (1, "Pot of Duality"),
    (1, "Reinforcement of the Army"),
    (1, "Bottomless Trap Hole"), (2, "Solemn Warning"), (1, "Solemn Judgment"),
    (1, "Torrential Tribute"), (1, "Mirror Force"),
  ],
  "extra": [
    (2, "Number 39: Utopia"), (1, "Number 17: Leviathan Dragon"), (1, "Number 34: Terror-Byte"),
    (1, "Number 19: Freezadon"),
  ],
},
"karakuri": {
  "main": [
    (3, 'Karakuri Merchant mdl 177 "Inashichi"'), (2, 'Karakuri Komachi mdl 224 "Ninishi"'),
    (2, 'Karakuri Watchdog mdl 313 "Saizan"'), (1, 'Karakuri Strategist mdl 248 "Nishipachi"'),
    (2, 'Karakuri Ninja mdl 7749 "Nanashick"'), (1, 'Karakuri Ninja mdl 919 "Kuick"'),
    (1, 'Karakuri Ninja mdl 339 "Sazank"'), (1, 'Karakuri Soldier mdl 236 "Nisamu"'),
    (2, 'Maxx "C"'), (2, "Effect Veiler"), (1, "Card Trooper"),
    (1, "Book of Moon"), (1, "Monster Reborn"), (1, "Dark Hole"), (2, "Mystical Space Typhoon"),
    (1, "Pot of Duality"), (1, "Smashing Ground"), (1, "Forbidden Chalice"),
    (2, "Karakuri Cash Cache"), (1, "Karakuri Cash Shed"),
    *TRAPS_STD, (2, "Dimensional Prison"), (1, "Compulsory Evacuation Device"), (1, "Call of the Haunted"),
  ],
  "extra": [
    (2, 'Karakuri Shogun mdl 00 "Burei"'), (2, 'Karakuri Steel Shogun mdl 00X "Bureido"'),
    (1, "Stardust Dragon"), (1, "Black Rose Dragon"), (1, "Brionac, Dragon of the Ice Barrier"),
    (1, "Trishula, Dragon of the Ice Barrier"), (1, "Ally of Justice Catastor"), (1, "Scrap Dragon"),
    (1, "Ancient Fairy Dragon"), (1, "Formula Synchron"), (1, "Number 39: Utopia"),
    (1, "Number 17: Leviathan Dragon"), (1, "Number 30: Acid Golem of Destruction"),
  ],
},
"blackwing": {
  "main": [
    (1, "Blackwing - Gale the Whirlwind"), (1, "Blackwing - Kalut the Moon Shadow"),
    (2, "Blackwing - Blizzard the Far North"), (3, "Blackwing - Shura the Blue Flame"),
    (2, "Blackwing - Sirocco the Dawn"), (3, "Blackwing - Bora the Spear"),
    (2, "Blackwing - Vayu the Emblem of Honor"), (1, "Blackwing - Zephyros the Elite"),
    (2, 'Maxx "C"'), (1, "Effect Veiler"),
    (1, "Black Whirlwind"), (1, "Monster Reborn"), (1, "Dark Hole"), (2, "Mystical Space Typhoon"),
    (1, "Book of Moon"), (1, "Foolish Burial"), (1, "Pot of Duality"), (1, "Allure of Darkness"),
    (2, "Delta Crow - Anti Reverse"), (2, "Icarus Attack"), *TRAPS_STD, (1, "Dimensional Prison"),
    (1, "Call of the Haunted"),
  ],
  "extra": [
    (2, "Blackwing Armor Master"), (1, "Black-Winged Dragon"), (1, "Blackwing - Silverwind the Ascendant"),
    (1, "Blackwing Armed Wing"), (1, "Stardust Dragon"), (1, "Black Rose Dragon"),
    (1, "Brionac, Dragon of the Ice Barrier"), (1, "Trishula, Dragon of the Ice Barrier"),
    (1, "Ally of Justice Catastor"), (1, "Red Dragon Archfiend"), (1, "Formula Synchron"),
    (1, "Number 39: Utopia"), (1, "Number 17: Leviathan Dragon"), (1, "Number 30: Acid Golem of Destruction"),
  ],
},
}
