---
title: Hackerrank Interview Prep Kit - Hashmaps
date: 2020-09-09 00:00:00 Z
layout: post
---
*The third part of my process of solving the Interview Preparation Kit on [HackerRank](https://www.hackerrank.com/)*
## Dictionaries and Hashmaps
### Hash Tables: Ransom Note(Easy)
Two lists contain words, m and n are given. We want to find out if all the words in n are contained in m (case-sensitive). Each word in m can be used in n only once.

I used a Python Dictionary to store the words and their counts. Then loop through words in n to see if it is existed in m and count is bigger than 0.

```python
def checkMagazine(magazine, note):
    word_dict = {}
    for word in magazine:
        if word in word_dict:
            word_dict[word] += 1
        else:
            word_dict[word] = 1
    for word in note:
        if word not in word_dict:
            print('No')
            return
        elif word_dict[word] == 0:
            print('No')
            return
        else:
            word_dict[word] -= 1
    print('Yes') 
```
### Two Strings(Easy)
Two strings are given. We need to find if this two strings contain same sub-strings. 

My thoughts are find all the sub-strings from the these two strings, then do an intersection, if the size of the intersection is bigger than 0, they have at least one substring in common. My code is below:

```python
def substrings(x):
    for i, j in itertools.combinations(range(len(x)+1), 2):
        yield x[i:j]

# Complete the twoStrings function below.
def twoStrings(s1, s2):
    ss1 = set(substrings(s1))
    ss2 = set(substrings(s2))
    nk=ss1.intersection(ss2)
    if nk:
        return 'YES'
    else:
        return 'NO'
```
However, again is too slow. I did some research and found the following code:
  
```python
def twoStrings(s1, s2):
    return 'YES' if set(s1) & set(s2) else 'NO'
```
This is very fast and beautiful. `set(s)` returns all the unique letters from `s` as a set (because our substring definition includes one letter, so we only need to find if there are letters appear on both strings). `&` here is a set intersection operation. It returns the intersection of these two sets. It is the same as what I wrote `set1.intersection(set2)`. I just did the redundant work to find all the substrings.  
### Sherlock and Anagrams
A string is given. We need to find all the pairs of [anagrams](https://www.wikiwand.com/en/Anagram) from its substring and output the numbers of the pairs. The descriptions are confusing, the example is:
> For example $s = mom$, the list of all anagrammatic pairs is $[m,m],[mo,om]$ at positions $[[0],[2]],[[0,1],[1,2]]$ respectively.

I think it means for all the same sized substrings pairs, find if they are anagrams. Anagrams mean they have same letters with same letter occurrence. I'm trying to solve this by processing following steps:
1. Find all the substrings.
2. For each substrings, sort them in alphabetical order then store them into a dictionary as keys. 
3. If two strings are anagrams, after sorted them in alphabetical order, they are now identical to each other. We store the total number of occurrences of such identical strings as their values in the dictionary.
4. Now we loop through this dictionary, for each key, if its value is great than 1, there is at least one pair. The total number of pairs for one key, is the combinations of their values.

```python
def substrings(x):
    for i, j in itertools.combinations(range(len(x)+1), 2):
        yield x[i:j]

# Complete the sherlockAndAnagrams function below.
def sherlockAndAnagrams(s):
    total_pairs = 0
    result_dict = {}
    for item in list(substrings(s)):
        sorted_item = sorted(item)
        sorted_item_str = ''.join(sorted_item)
        if sorted_item_str not in result_dict:
            result_dict[sorted_item_str] = 1
        else:
            result_dict[sorted_item_str] += 1
    for key,value in result_dict.items():
        if value == 2:
            total_pairs += 1
        elif value > 2:
            total_pairs += (math.factorial(value) // (2 * math.factorial(value - 2)))
    return total_pairs
```
