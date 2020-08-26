---
title: Cryptography in the age of the computers
date: 2020-02-29 00:00:00 Z
layout: post
---

*This is the third reading note of [The code book](https://simonsingh.net/books/the-code-book/) by Simon Singh.*

**What I’ve learnt:**

**Feistel cipher and DES**

The first computer, called ENIAC, was invented in 1945 at the University of Pennsylvania. Since then, computers have brought new opportunities and challenges to the world of cryptography.

The first breakthrough cryptographers had that I want to mention is Feistel cipher crated by Horst Feistel. During the 1960s, computers became more powerful and cheaper. Businesses were increasingly able to afford computers and could use them to encrypt communications. However, there was no standardisation and people used all different sorts of encryption. Feistel cipher is a block cipher, which means the plaintext is translated into a long string of binary digits then the string is split into blocks and encryption is performed separately on each block. Certain number of rounds of actions are performed with each block and there is one different sub-key for each round. On each round, the block split into two equal pieces, the right part becomes the left part of the next round. The digits in the right part then put through a encrypt function using the round sub-key. The result then joins the left part, perform a XOR operation and becomes the new right. Then the process repeats for all the rounds. The beautiful aspect of the Feistel cipher is that you can use the same processes for decryption, only change needs to make is reverse the round sub-keys.

![feistel]({{ site.url }}/attachments/feistel.png) 
 
Feistel ciphers were first seen in IBM’s Lucifer cipher and then adopted by the U.S. Federal Government on 1976, naming it as the DES which means Data Encryption Standard. The U.S government chose to limit the number of keys to 56 bits. DES was strong and security enough back then and used as a standard for businesses because it was impossible for a civilian computer to break it. However, there is still one more major issue which is key distribution.

**Diffie-Hellman-Merkle key exchange:**

For centuries, key distribution was a problem for cryptographers. No matter how strong cipher is, the senders have to deliver the keys to the receivers. If the enemies have the keys, they can break your cipher. The first breakthrough for breaking the Enigma machine came from a Germany that gave the daily keys to the Allies. The key distribution problem was persisted in the early age of computers. The keys sheets were put into padlocks and delivered by riders. It was an enormous logistical problem and the weak link of the information security.

The breakthrough on this problem was accomplished by a trio: Whitfield Diffie, Martin Hellman and Ralph Merkle. They took advantages of modular arithmetic which is easy to implement but very difficult to undo. An example used to explain it is mixing two different colours. It’s easy to mix but hard to un-mix (separate the mixed back into the two original colours). Using this analogy, let’s say there is Alice, Bob and Eve. All of them have a basket of yellow paint. Alice wants to send a message to Bob, each of them adds their secret colours into the yellow paint. Then they send the mixture to each other, Alice and Bob again add their secret colour to the mixture. Both baskets should now be the same colour. This colour can be used as the key. Eve only knows the base yellow colour and the mixture transferred. Because Eve does not know Alice and Bob’s secret colour, Eve does not know the final colour because it is hard to un-mix the mixture to get the secret colour. Bringing the analogy back to a real-life exchange using large numbers rather than colours, this determination is computationally expensive. It is impossible to compute in a practical amount of time even for modern supercomputers.
The scheme was published in 1976 and it is considered to be the greatest cryptographic achievement since the invention of the monoalphabetic cipher over two thousand years ago. However, there is still one small problem, in order to perform this kind key exchange, both parties have to be online at the same time.

**Asymmetric key and RSA**

To solve the above problem, the concept of the asymmetric key cipher was concocted by Diffie. He incorporated a type of cipher that, encryption and decryption require two different keys. So that one can encrypt a message, but he cannot decrypt it. The ideal further implemented by another trio, Ronald Rivest, Adi Shamir and Leonard Adleman.

One import aspect of the RSA cryptosystem is the use of a number N. N is the product of two prime numbers, p and q. N would be public knowledge and p, q is secret. Knowing N, is hard to produce the number p and q. The detailed process of this their algorithm can be found online for example Wikipedia here:\
[https://en.wikipedia.org/wiki/RSA_(cryptosystem)](https://en.wikipedia.org/wiki/RSA_(cryptosystem))
 
**My analysis:**

There were lots of great breakthroughs after the World War 2 because the invention and development of computers and computer networks. With each new industrial and technology revolutions the cryptography world faces new challenges and opportunities. The need of secret communication will not change.
The cipher concepts and algorithms I learnt this week is still using today except DES was replaced by AES. Like the vigenere cipher or the Enigma machine, find an alternate way of distribution keys were considered mission impossible. Only fools would try to solve it, turns out God always rewards fools. Using a Steve Jobs quote to conclude is:
Stay Hungry. Stay Foolish.
