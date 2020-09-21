---
title: The machines and the geniuses behind them
date: 2020-03-07 00:00:00 Z
layout: post
---

*This is the second reading note of [The code book](https://simonsingh.net/books/the-code-book/) by Simon Singh. It covers character 3-4.*

**What I learned**

In the early 20th century, the Great War just ended. Telegram was widely used in the world, however, there is still no cipher could replace the Vigenere Cipher. One German inventor named Arthur Scherbius, had the ideal of designing an electrical and mechanical cryptographic machine. He called it the Enigma machine and it became the most fearsome system of encryption in history.

Enigma machine, although it has different variations, contains the following main parts: rotor (sometimes called the scrambler) unit, keyboard, lampboard and plugboard. Keyboard and lampboard are used as input and output devices so that the Enigma machine could be easily operated, type one letter using the keyboard and the encrypted will light up on the lampboard. The rotor unit contains three rotors from a set of five and one reflector. The positions of these three rotors could be interchangeable. The rotor is a thick disc riddled with wires and it has 26 orientations (one for each letter). The internal wirings of these three scramblers connected by keyboard and lampboard, they determine how the plaintext letters will be encrypted. The rotors rotate each time a letter is encrypted. The reflector is a disc contains looped wire so that the scrambler unit works both encryption and decryption. The following graph is an example of the scrambling action of Enigma's rotors, for two consecutive letters with the right-hand rotor moving one position between them.

![enigma action]({{ site.url }}/assets/Enigma-action.svg)  

Another important feature is the plugboard between the keyboard and the first scrambler. The plugboard allows the sender to insert cables which have the effect of swapping some of the letters before they enter the scrambler. The Enigma operator had six cables, which meant that six pairs of letters could be swapped.

The Enigma machine is a polyalphabetic cipher like the Vigenera Cipher with the keys being which three rotors have been chosen, their placement, their orientations and the plugboard settings. How many different keys are there?

Rotor orientations: each can be set in of the 26 orientations so 26 x 26 x 26 = 17,576\
Rotor arrangements: three rotors chose from five: 5 x 4 x 3 = 60\
Plugboard, swapping six pairs of letters out of 26: 26! / (6! x 10! x 2^10) = 100,391,791,500\
Total number of possible keys: 158,962,555,217,826,360,000 ≈ 267.1 

Because of this large number of possible keys, crack the Enigma machine is believed to be an impossible mission for Allied cryptanalysts. When the Second War started, Nazi Germany used this informational advantage thoroughly on their Blitzkrieg, Luftwaffe and U-boat operations. The first breakthrough came from a Polish cryptanalyst named Marian Rejewski. After the Poland get their hands on Enigma machines and operational manuals from a Germany traitor. The Polish cryptanalyst found that the Germany uses a ‘day-key’ for each different days and a ‘message-key’ for each message. The ‘message-key’ is encrypted by the ‘day-key’ and typed at the beginning of the message twice. Then the rest of the message is encrypted by the ‘message-key’. Rejewski used this knowledge and recorded all the ‘message-key’s from intercepted messages for year. He finds the pattern designed a machine called bombes to exploit it. The Polish cryptanalysts shared their breakthrough with the Allies. With the urgent need of cracking the Enigma code, the British formed a codebreaking organisation at Bletchley Park, Buckinghamshire. They recruited mathematicians, linguists, chess champions, bridge experts and crosswords enthusiasts. There were many great cryptanalysts and many significant breakthroughs, however, there is one figure who deserves to be singled out, it is Alan Turing. Turing believed that the Allies could not rely on the repeated ‘message-key’ to crack the message because the Germany will soon abandon this behaviour. In order to be one step ahead, Turing was looking for other ways to find patterns. He read vast number of decrypted messages and he found that, every day at around 6am, the Germany will send out a weather report, the message would be almost certain to contain ‘wetter’, the German word for ‘weather’. Turing exploited this fact and re-designed the bombes machine. The British carefully hide the fact that they have already cracked the Enigma machine from the German and shared the information with the Allies and Soviet Union. It has been argued, albeit controversially, that Bletchley Park’s achievements were the decisive factor in the Allied victory.

**My analysis:**

Using Bits of Security notion, the Enigma machine described above would have 68 bits of security. Using a computer with 2GHz processor, assuming it can do 2 billion key guesses per second. It takes about 268 / 2 x 109 ≈ 1.47 x 1011 seconds which would be more than 4661 years in the worst case or more than 2330 years in the average case to brute force it. Imagine during a time where computers have not invented, cracking the Enigma machine would be impossible. Fortunately, the Allied cryptanalysts understood that human is the weakest link in security. During the Second War, Germany officers would choose the same message keys over and over again despite they are asked to use different random keys each time and the repeated words like ‘wetter’ used in every day’s message gave the break points the Allied cryptanalysts needed.  
