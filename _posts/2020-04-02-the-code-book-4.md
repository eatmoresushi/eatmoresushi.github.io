---
title: Pretty Good Future
date: 2020-04-02 00:00:00 Z
layout: post
---

*This is the fourth reading note of [The code book](https://simonsingh.net/books/the-code-book/) by Simon Singh.*

## What I’ve learnt
### Pretty Good Privacy
 
During the late 1980s, although RSA encryption has been invented long ago, only government, the military and large businesses run RSA because it requires a substantial amount of computing power. General public still didn’t have a way to protect their digital communications. 
Phil Zimmermann, pointed out that in the information age, people’s communications, for example, e-mails were more easier for government to intercept. In order to protect privacy and freedom of speech and let the general public also benefit from RSA, he created Pretty Good Privacy, or PGP for short. In order to short the time needed for RSA, he only use it for the key. The sender would send out encrypted message by the key and encrypted key by the receiver’s public key. The receiver, on the other hand, decrypt the key use the receiver’s private key first, then decrypt the message use the key. 
Another helpful aspect of PGP is its facility for digital signature. If Alice want to send a letter to Bob, she can encrypt the message using her own private key first then encrypt the result using Bob’s public key. Bob first decrypt it using his private key and then use Alice’s public key to decrypt it. This way Bob could be sure that is Alice who sent the e-mail because only Alice has her private key.

### Encryption for the Masses…Or not?

PGP ignited a debate about the positive and negative effects of encryption in the information age. The fundamental question is whether or not governments should legislate against cryptography. The supports argue that cryptography should be restricted so the law enforcers could intercept criminals’ communications. On the other hand, civil libertarians believe that privacy is a fundamental of Human Rights. Everyone should have the rights to use cryptography to protect their communications.

### The future

Quantum computing is the use of quantum-mechanical phenomena such as superposition and entanglement to perform computation. Traditional computers operate on logic gate, 1’s and 0’s called bits. Quantum computer uses qubits, qubits can be in a 1 or 0 quantum state, or they can also be in a superposition of the 1 and 0 states. What’s superposition? A famous notation is the ’Schrodinger’s cat’, imagine a cat in a box with a vial of cyanide and close the lid. We don’t know the cat is live or dead until we open the lid. While the cat in the box, it is in a superposition of two states. Quantum cryptography is the science of exploiting this properties to perform cryptographic tasks. For example, if we want to distribute the key, it is impossible to copy data encoded in a quantum state (think of the data as the cat in the box). If one attempts to read the encoded data, the quantum state will be changed (like you open the lid of the box). This could be used to detect eavesdropping in quantum key distribution.
 
## My analysis 
The debate of whether or not the general public’s use of cryptograph should be restricted is still a focus of controversies and public attention. I believe that the technology itself is innocent. I understand the conserns of criminals use it to encrypt their communication so the police cannot know. However, a pair of gloves, could prevent the police to get the criminals fingerprints, should we restrict the gloves as also? Cryptography is just a data-protection technology and it should be available to everyone. 
