---
title: The early age of cryptography and the indecipherable cipher
date: 2020-02-29 00:00:00 Z
layout: post
---

*This is the first note I took while I was reading The code book by Simon Singh. This is also my something awesome project for COMP6441 Security Engineering and Cyber Security course in UNSW*

**What I’ve learnt:**

Cryptography is the art of encrypting and decrypting the meaning of a message to make a secure communication between the sender and receiver. So that even if the message is intercepted by others, they would not know the meaning. It played a crucial role in human history both in civilian activities and military. It will continue to impact the outcome of the world.

There are two major branches of cryptography which is transposition and substitution. In transposition, the letters of the message are simply rearranged. Using one from our learning activities as an example, the encrypted text:

TGPRGWTADEKI HI6OYNODONAT ES4LOCIINTB} FC4LURSDTHO_ LO1IRYAEEIU_ AM{NOPBAVNT_

It could be rearranged as the following and read vertically from left to right:

TGPRGWTADEKI

HI6OYNODONAT

ES4LOCIINTB}

FC4LURSDTHO_

LO1IRYAEEIU_

AM{NOPBAVNT_

In substitution, each letter is substitute with another letter. The earliest documented use for military is in Julius Caesar’s Gallic Wars. Caesar simply replaced each letter with the letter that is three space down in the alphabet. Later on, keys or look-up tables are invented, both the sender and the receiver keep a copy of a look-up table. The sender uses it to encrypt it and the receiver use it to decrypt it. The keys could be any rearrangement of the alphabet and there are over 400,000,000,000,000,000,000,000,000 such rearrangements so that it is impossible for human brains to use brute force to break it. This kind of cipher, that each letter is replaced by another one letter, called a monoalphabetic substitution cipher.

However, the codemakers lead didn’t not hold long. By the ninth century, an Arab scientist found out that the frequencies of letters could be exploited in order to break ciphers. For example, in English, the top three most frequencies letters are e, t and a. If we want to decrypt a monoalphabetic cipher and we know the plaintext is in English, we could find the three most common letters in the cipher text and assume each of them represents one of the three most frequencies letters in English, e, t or a. Another aspect is explored to help the decryption is the relationship between letters, for example, the letter e can appear before and after every other letter, but the letter t is rarely seen before or after b, d, g, j, k, m, q or v. If the ciphertext contains spaces, 1 to 3 letter words could be breakpoints as also.

With the development of encryption on monoalphabetic cipher, the world demands a new cipher. A French diplomat named Blaise de Vigenere, based on many other’s research, created so-called Vigenere cipher. It was called ‘the indecipherable cipher’ because no one could break it for three centuries. It uses a table called ‘Vigenere square’ like this:

<img src="{{site.url}}/images/Vigenere_square_shading.svg" style="display: block; margin: auto;" />

And a key, for example, ‘UNSW’. The keyword is repeated throughout the ciphertext. Let’s look at the following example:

Keyword:    U  N  S  W  U  N  S  W

Plaintext:  C  O  M  P  O  P  E  N

Ciphertext: W  B  E   L   I  C  W  J 

For each letter to be encrypted, we look up the keyword letter and find the corresponding replacement. For example, for the first letter is C and the keyword letter is U, we look up the Vigenere square, find the U row and C column, the replacement is W. It could be noticed that although there are two Os and two Ps in the plaintext, the corresponding ciphertext is different. Thus, it provided a defence to the traditional frequencies attacks because the frequencies are evenly distributed.

The Vigenere cipher is unbreakable until about 300 years later, at the year of 1863, a retired officer in the Prussian army named Friedrich Wilhelm Kasiski published his cryptanalytic essay. During the same time, same method is discovered but a British inventor named Charles Babbage. Kasiski and Babbage found that the frequency analysis is still the key to decrypted Vigenere cipher. Although different letters are used to replace the same letter in the plaintext, the key itself is repeated. A same sequence could be repeated because of this. By calculating the space between the repeated sequence, we could guess the length of the key. Once we know the length of the key, we can try to get the key. For example, if my key is ‘UNSW’ which has a length of four. Then my 1st, 5th, 9th etc letters would use the same row in the Vigenere square. If I extract these letters then the problem became a monoalphabetic cipher. Since each row of the Vigenere square is a shift of normal alphabet. If we compare the distribution of letters with the normal distribution, we can find the first letter of my key. And we can do the same with the following letters in the key.  

At the end of the nineteenth century, cryptography was in disarray because the work done by Kasiski and Babbage. The codemakers once again are in searching for a new cipher.

**My analysis:**

There is always a competition between the codemakers and codebreakers. The most important cypyptography during this age is, of course, the Vigenere cipher. Even today, I think it is still strong enough to people who does not know cypyptography. Kasiski and Babbage’s method on how to break it may not work if the keys are not repeted frequently. For example, if I use UNSW as the key, but I change the second time of UNSW to VNSW then next time WNSW, so the key is now UNSWVNSWWNSW…SNSWTNSW which is 104 of length. When give out the key to our receiver, we can use some format like UNSW1, so that they know it is the first letter will change. A key like this will cause a lot of trouble to Kasiski and Babbage’s method and would be nearly impossbile for them (without the help of computers) to break.  
