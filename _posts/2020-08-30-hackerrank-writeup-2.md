---
title: Writeups for Interview Preparation Kit - Arrays
date: 2020-08-30 00:00:00 Z
layout: post
---
*The second part of my process of solving the Interview Preparation Kit on [HackerRank](https://www.hackerrank.com/)*
## Arrays
### 2D Array - DS(Easy)
We are given a 6 x 6 2D array, and an hourglass pattern like the following:

```
a b c
  d
e f g
```
We need to find all the hourglasses in the given 2D array. There are 16 of them. The sum of each hourglass is compared and the biggest sum is returned.  

Because the size of the 2-D array is fixed. Loop through the array and calculate the sums and find the biggest one is enough. Notice that, because the values in 2-D array are in the range `-9<=v<=9`. The inited running sum is set to `-64`.

```python
def hourglassSum(arr):
    biggest = -64
    for i in range(0,4):
        for j in range(0,4):
            hsum = sum((arr[i][j],arr[i][j+1],arr[i][j+2],arr[i+1][j+1],arr[i+2][j],arr[i+2][j+1],arr[i+2][j+2]))
            if hsum > biggest:
                biggest = hsum
    return biggest
```
### Arrays: Left Rotation(Easy)
A list of numbers is given. We need to implement the left rotation on the list `n` times.

I created two new list called `temp_list` and `old_list`, the `old_list` stores the value of the original list that did not rotate, the `temp_list` stores the values got left rotated.

```python
def rotLeft(a, d):
    temp_list = []
    old_list = []
    if d == len(a):
        return a
    for i in range(0,d):
        temp_list.append(a[i])
    for i in range(d, len(a)):
        old_list.append(a[i])
    return old_list + temp_list
```
### New Year Chaos(Medium)
A list of numbers is given. The list represents a queue of people waiting for the ride. The numbers are sorted and starts from 1 to the length of the list. It means the position of the person in the queue. Any person can bribe the person in front of them to swap positions, but can bribe at most two others. Now the queue after bribing is given. We need to find what't s the minimum number of bribes happened. For example, `[2,1,5,3,4]` is given, we can concluded there is minimum three bribes. Because the person at position no.5 bribe twice, now he is at no.3. The person at position no.2 also bribe once with the person at no.1 and their positions are swapped. We should print `Too chaotic` if we find a person bribed more than 2 times.

The question can be simplified as a sorting problem. But we could not use the total number of movements, because the question limits that each person could only move most 2 steps. We need keep a track on how many steps moved.

- The first attempt using Bubble sort, it is not fast enough. The average time complexity is $O(n^2)$:

```python
def minimumBribes(q):
    no_brides = 0
    chaotic = False
    n = len(q)
    max_traveled = [0] * n
   # Traverse through all array elements
    for i in range(n):
   # Last i elements are already in correct position
        for j in range(n-i-1):
            # Swap if the element found is greater than the next element
            if q[j] > q[j+1] :
                max_traveled[q[j] - 1] += 1
                q[j], q[j+1] = q[j+1], q[j]
                no_brides += 1
    if max(max_traveled) > 2:
        print('Too chaotic')
    else:
        print(no_brides)
```

I added two early stops to my above code. The first is if the array is already sorted, then second is if one person moved more than 2 steps. This passes all the tests.

```python
def minimumBribes(q):
    no_brides = 0
    chaotic = False
    n = len(q)
    max_traveled = [0] * n
   # Traverse through all array elements
    for i in range(n):
        asorted = True
   # Last i elements are already in correct position
        for j in range(n-i-1):
            # Swap if the element found is greater than the next element
            if q[j] > q[j+1] :
                asorted = False
                max_traveled[q[j] - 1] += 1
                if max_traveled[q[j] - 1] > 2:
                    print('Too chaotic')
                    return
                q[j], q[j+1] = q[j+1], q[j]
                no_brides += 1
        if asorted: 
            print(no_brides) 
            return
```

- Alternatively, Because the question only asks the number of bribes. I can only count the number of people who overtake a person.

```python
def minimumBribes(q):
    count = 0
    for i in range(len(q) - 1, -1, -1):
        if (q[i] - (i + 1) > 2):
            print('Too chaotic')
            return
        j = max(0, q[i] - 2)
        for ii in range(j,i):
            if q[ii] > q[i]:
                count += 1
    print(count)
    return          
```
### Minimum Swaps 2(Medium)
Again, a list of numbers are given. The numbers are consecutive integers 1 through n. We still need to sort it but this time, we have to sort by swapping two numbers. The question is the minimum swaps needed.

I was confused and had to read the instructions multiple times to understand what it is really asking. Then I cannot think of a way to solve this. After asking Google, I find there is a [stackoverflow question](https://stackoverflow.com/questions/15152322/compute-the-minimal-number-of-swaps-to-order-a-sequence/15152602#15152602) for this. Apparently using graph theory, and create edge from one number in the list to its correct ordering position, we will create several cycles. The number of the minimum swaps are the sum of (length - 1)s of the cycles. For example, for the list `[2,4,3,1]`, we create the following cycles `2->4->1->2`, `3->3`, hence, the minimum swap is $(3-1)+(1-1)=2$. I ended up used the code similarly to one of the answers. 
