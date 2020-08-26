---
title: Code Cracking Part 1
date: 2020-03-26 00:00:00 Z
layout: post
---
*This is a write-up for solving the code challenges 1-4 in the [The code book](https://simonsingh.net/books/the-code-book/) by Simon Singh.*

## Stage 1 Simple Monoalphabetic Substitution Cipher

**Ciphertext:**

```
BT JPX RMLX PCUV AMLX ICVJP IBTWXVR CI M LMT’R PMTN, MTN YVCJX CDXV MWMBTRJ JPX AMTNGXRJBAH UQCT JPX QGMRJXV CI JPX YMGG CI JPX HBTW’R QMGMAX; MTN JPX HBTW RMY JPX QMVJ CI JPX PMTN JPMJ YVCJX. JPXT JPX HBTW’R ACUTJXTMTAX YMR APMTWXN, MTN PBR JPCUWPJR JVCUFGXN PBL, RC JPMJ JPX SCBTJR CI PBR GCBTR YXVX GCCRXN, MTN PBR HTXXR RLCJX CTX MWMBTRJ MTCJPXV. JPX HBTW AVBXN MGCUN JC FVBTW BT JPX MRJVCGCWXVR, JPX APMGNXMTR, MTN JPX RCCJPRMEXVR. MTN JPX HBTW RQMHX, MTN RMBN JC JPX YBRX LXT CI FMFEGCT, YPCRCXDXV RPMGG VXMN JPBR YVBJBTW, MTN RPCY LX JPX BTJXVQVXJMJBCT JPXVXCI, RPMGG FX AGCJPXN YBJP RAM
```

**Process:**

First I notice the letter M as a word, and then MTN as a three letter word. M is either 'a' or 'i', because I can't think of any common three letter word starts with 'i', I assume MTN is 'and'. Then the beginning of the text, BT became '?n', because we assumed M is 'a', then BT probably is 'in'. Then I found another high frequency three letter word JPX and assumed it is 'the'. Next I'm trying to crack CI, the common 2 letter word doesn't contain all letters I know above, I assume is 'of'. Then I notice there are both YMR and RMY which means both '?a?' and '?a?', I assume they are 'was' and 'saw'. From LMT’R I assume R is 's'. MWMBTRJ became 'a?ainst' which I assume is 'against'. I continued like this and solved this puzzle which is a phase from the Bible.

**Plaintext:**

```
in the same hour came forth fingers of a man’s hand, and wrote over against the candlestick upon the plaster of the wall of the king’s palace; and the king saw the part of the hand that wrote. then the king’s countenance was changed, and his thoughts troubled him, so that the joints of his loins were loosed, and his knees smote one against another. the king cried aloud to bring in the astrologers, the chaldeans, and the soothsayers. and the king spake, and said to the wise men of babylon, whosoever shall read this writing, and show me the interpretation thereof, shall be clothed with sca
```

## Stage 2 Caesar Shift Cipher

**Ciphertext:**

```MHILY LZA ZBHL XBPZXBL MVYABUHL HWWPBZ JSHBKPBZ JHLJBZ

KPJABT HYJHUBT LZA ULBAYVU
```

**Process:**

Because I know it is a Caesar Shift Cipher, assume English letters were used, there are total of 25 possible shifts. I wrote a Python program to brute force it. I thought it is done until I saw the results. All of them are nonsense to me, I realise they are not in English. I don't know which language is it. I thought of my friend Google, the correct text should have much more search results in Google than others. I modified my program and solved it. Below was the code I used:

**Plaintext:**

```
FABER EST SUAE QUISQUE FORTUNAE APPIUS CLAUDIUS CAECUS DICTUM ARCANUM EST NEUTRON
```

Which is in Latin and roughly translated to:

```
Blind Appius Claudius is a craftsman of his every fortune, the silent word is neither.
```

 

## Stage 3 Monoalphabetic Cipher with Homophones

**Ciphertext:**

```
IXDVMUFXLFEEFXSOQXYQVXSQTUIXWF*FMXYQVFJ*FXEFQUQX
JFPTUFXMX*ISSFLQTUQXMXRPQEUMXUMTUIXYFSSFI*MXKFJ
F*FMXLQXTIEUVFXEQTEFXSOQXLQ*XVFWMTQTUQXTITXKIJ*F
MUQXTQJMVX*QEYQVFQTHMXLFVQUVIXM*XEI*XLQ*XWITLIXE
QTHGXJQTUQXSITEFLQVGUQX*GXKIEUVGXEQWQTHGXDGUFXTIT
XDIEUQXGXKFKQVXSIWQXAVPUFXWGXYQVXEQJPFVXKFVUPUQXQX
SGTIESQTHGX*FXWFQFXSIWYGJTFXDQSFIXEFXGJPUFXSITXRPQEUG
XIVGHFITXYFSSFI*CXC*XSCWWFTIXSOQXCXYQTCXYIESFCX*FXCKV
QFXVFUQTPUFXQXKI*UCXTIEUVCXYIYYCXTQ*XWCUUFTIXLQFXVQW
FXDCSQWWIXC*FXC*XDI**QXKI*IXEQWYVQXCSRPFEUCTLIXLC*X*C
UIXWCTSFTIXUPUUQX*QXEUQ**QXJFCXLQX*C*UVIXYI*IXKQLQCX*CX
TIUUQXQX*XTIEUVIXUCTUIXACEEIXSOQXTITXEPVJQCXDPIVXLQ*X
WCVFTXEPI*IXSFTRPQXKI*UQXVCSSQEIXQXUCTUIXSCEEIX*IX*PWQ
XQVZXLFXEIUUIXLZX*ZX*PTZXYIFXSOQXTUVZUFXQVZKZWXTQX*Z*
UIXYZEEIRPZTLIXTZYYZVKQXPTZXWITUZJTZXAVPTZXYQVX*ZXLFEUZT
HZXQXYZVKQWFXZ*UZXUZTUIXRPZTUIXKQLPUZXTITXZKQZ
XZ*SPTZXTIFXSFXZ**QJVNWWIXQXUIEUIXUIVTIXFTXYFNTUIXS
OQXLQX*NXTIKNXUQVVNXPTXUPVAIXTNSRPQXQXYQVSIEE
QXLQ*X*QJTIXF*XYVFWIXSNTUIXUVQXKI*UQXF*XDQXJFVBVXSI
TXUPUUQX*BSRPQXBX*BXRPBVUBX*QKBVX*BXYIYYBXFTXEPEIXQX
*BXYVIVBXFVQXFTXJFPXSIWB*UVPFXYFBSRPQFTDFTXSOQX*XWBVXDP
XEIYVBXTIFXVFSOFPEIXX*BXYBVI*BXFTXSILFSQXQXQRPBUIV
```

**Process:**

First I had to understand what is homophones? According Wikipedia, a homophone is a word that is pronounced the same (to varying extent) as another word but differs in meaning. That might means some words has changed letters or represent by different letters in the ciphertext. First I did a letter frequency analysis and found 'X' appears much more than anything else. I assume the 'X' represents a space. I removed the X and try to apply my frequency analysis to the rest. However, I could not find anything useful.

## Stage 4 Vigenere Cipher

**Ciphertext:**

```
K Q O W E F V J P U J U U N U K G L M E K J I

N M W U X F Q M K J B G W R L F N F G H U D W

U U M B S V L P S N C M U E K Q C T E S W R E

E K O Y S S I W C T U A X Y O T A P X P L W P

N T C G O J B G F Q H T D W X I Z A Y G F F N

S X C S E Y N C T S S P N T U J N Y T G G W Z

G R W U U N E J U U Q E A P Y M E K Q H U I D

U X F P G U Y T S M T F F S H N U O C Z G M R

U W E Y T R G K M E E D C T V R E C F B D J Q

C U S W V B P N L G O Y L S K M T E F V J J T

W W M F M W P N M E M T M H R S P X F S S K F

F S T N U O C Z G M D O E O Y E E K C P J R G

P M U R S K H F R S E I U E V G O Y C W X I Z

A Y G O S A A N Y D O E O Y J L W U N H A M E

B F E L X Y V L W N O J N S I O F R W U C C E

S W K V I D G M U C G O C R U W G N M A A F F

V N S I U D E K Q H C E U C P F C M P V S U D

G A V E M N Y M A M V L F M A O Y F N T Q C U

A F V F J N X K L N E I W C W O D C C U L W R

I F T W G M U S W O V M A T N Y B U H T C O C

W F Y T N M G Y T Q M K B B N L G F B T W O J

F T W G N T E J K N E E D C L D H W T V B U V

G F B I J G Y Y I D G M V R D G M P L S W G J

L A G O E E K J O F E K N Y N O L R I V R W V

U H E I W U U R W G M U T J C D B N K G M B I

D G M E E Y G U O T D G G Q E U J Y O T V G G

B R U J Y S
```
 

Process:

Since we know it is a vigenere cipher, I tried to write a python program to solve.

The program can be found here:

https://github.com/eatmoresushi/vigenere_cipher_solver

First, I wrote a vigenere cipher encode/decode function. It basiclly takes a message and a key, for each letter in message, add/minus the positions in the alphabetic according to the key. 

Second, I wrote a function to calculate the distance of all repeated sequences that have length between 3 to 5 in the message. Count the occurrences of all the faactors in order to guess the key length.

Third, I used the key length to extract all the sub-messages. For examle, if the key length is 4, we find every fourth letter starting the first letter as a single sub-string. Then we do the same starting the second, third and fourth letter. This way, we have 4 sub-strings. For each sub-strings, we decrypt the sub-string 26 times (once for each of the 26 possible subkeys). Now we got 26 decrypted sub-strings. 

Then I use English frequency analysis, try to find the subkey for each sub-string. The English frequency analysis compare the letter frequency in the sub-string with the normal English distribution. 

Now we got possible subkeys for each sub-string. The key for the vigenere cipher is a word consist each letter from the subkey. In this case we got lucky and find the keyword is 'SCUBA'. The plain text is poem called L'Albatros by Charles Baudelaire.

Plaintext:

```
Souvent, pour s'amuser, les hommes d'équipage
Prennent des albatros, vastes oiseaux des mers,
Qui suivent, indolents compagnons de voyage,
Le navire glissant sur les gouffres amers.

À peine les ont-ils déposés sur les planches,
Que ces rois de l'azur, maladroits et honteux,
Laissent piteusement leurs grandes ailes blanches
Comme des avirons traîner à côté d'eux.

Ce voyageur ailé, comme il est gauche et veule!
Lui, naguère si beau, qu'il est comique et laid!
L'un agace son bec avec un brûle-gueule,
L'autre mime, en boitant, l'infirme qui volait!

Le Poète est semblable au prince des nuées
Qui hante la tempête et se rit de l'archer&semi&semi;
Exilé sur le sol au milieu des huées,
Ses ailes de géant l'empêchent de marcher.
```
