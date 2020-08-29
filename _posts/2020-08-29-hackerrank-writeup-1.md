---
title: Writeups for Interview Preparation Kit on HackerRank Part 1
date: 2020-08-29 00:00:00 Z
layout: post
---
*The first part of my process of solving the Interview Preparation Kit on [HackerRank](https://www.hackerrank.com/)*
## Warm-up Challenges
### Sock Merchant(Easy)
You are a sock merchant and given a list of numbers (each different number represent a different colour) like this `[1,1,2,1,2,3]`stored in the variable `ar`. You are asked to find how many pairs are in there.

One easy way is to use `Counter` from `collections` library. A `Counter` is a `dict` subclass so I could loop through it and find pairs. Code snippet is below:

```python
def sockMerchant(n, ar):
    pair_counter = 0 
    result = Counter(ar)
    for key, value in result.items():
        if value > 1:
            pair_counter += value // 2
    return pair_counter
```
### Counting Valleys(Easy)
Imagine a person walks down and up. He starts at sea level, we want to find how many valleys he has been to from his record of steps. The record is a `string` and we use `U` to represent an uphill and `D` to represent a downhill.
>A valley is a sequence of consecutive steps below sea level, starting with a step down from sea level and ending with a step up to sea level.

For example, `UDDDUDUU` indicates he only has been to one valley. I used a boolean here as an indicator that the person is still visiting a valley a lot. By recording each step and change the boolean value this can be easily solved.

```python
def countingValleys(n, s):
    # assume sea level is 0
    current_level = 0
    v_count = 0
    visiting_valley = False
    for step in s:
        if step == 'U':
            current_level += 1
            if current_level == 0:
                visiting_valley = False
                v_count += 1
        elif step == 'D':
            if current_level == 0:
                visiting_valley = True
            current_level -= 1
    return v_count
```
### Jumping on the Clouds(Easy)
Given a list of number only contains 0s and 1s. We can jump in one or two steps. 1s are to be avoided (cannot land on 1s). For example, if `[0,0,0,0,1,0]` is given, we can jump from 0th to 2nd, then 2nd to 3rd, now we can skip the 1, jump from 3rd to 5th. That's total of 3 jumps. We need to find the minimum jumps. 

Looping through the list given, first I check if jump 2 spaces is possible, that is if the value at `current index + 2` is 0 or not. If it is not 0, then we only can do one step jumps. I also use an integer to record the current position.

```python
def jumpingOnClouds(c):
    jumps = 0
    current_position = 0
    for i, n in enumerate(c):
        if current_position > i:
            continue
        elif (i+2) < len(c) and c[i+2] == 0:
            current_position = i + 2
            jumps += 1
        elif (i+1) < len(c) and c[i+1] == 0:
            current_position = i + 1
            jumps += 1
    return jumps
```
### Repeated String(Easy)
Given a string `s` and a number `n`. We return how many `a`s are there. if the length of `s` is less than `n`, the content of `s` is repeated. For example, if `s='aba'` and `n=10`, first `s` becomes `abaabaabaa`, hence, there are 7 `a`s.

Because I just watched one awesome video produced by Computerphile called [Laziness in Python](https://www.youtube.com/watch?v=5jwV3zxXc8E&t=2s). I want to try generator myself. I wrote the following code:

```python
def gen(ori_str,max_n):
    for i in range(max_n):
        yield s[i % len(ori_str)]

def repeatedString(s, n):
    count = 0
    sg = gen(s,n)
    for _ in range(n):
        if next(sg) == 'a':
            count += 1
    return count
``` 
This code works fine, but unfortunately, some of the test strings are very big. My code above exceed the time limits. I was over-thinking the problem. I just need to calculate total appearances of `a`s in the original string, then count how many times the original string will be repeated. For non full repetitions, I just need to check if those got repeated contain `a`s.

```python
def repeatedString(s, n):
    no_of_a = s.count('a')
    count = (n // len(s)) * no_of_a
    rem = n % len(s)
    for i in range(rem):
        if s[i] == 'a':
            count += 1
    return count
```   