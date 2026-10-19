/* macOS-only slow fixture: an owned out-of-group waiter holds a zombie in
 * the original session. Alarm bounds the waiter if the test is interrupted. */
#include <unistd.h>
#include <stdio.h>
#include <signal.h>
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  int ready[2];
  if (pipe(ready)) return 3;
  pid_t group = getpid(), waiter = fork();
  if (waiter < 0) return 4;
  if (waiter == 0) {
    close(ready[0]);
    if (setpgid(0, 0)) _exit(5);
    alarm(5);
    pid_t zombie = fork();
    if (zombie < 0) _exit(6);
    if (zombie == 0) {
      if (setpgid(0, group)) _exit(7);
      _exit(0);
    }
    usleep(100000);
    FILE *f = fopen(argv[1], "w");
    if (!f) _exit(8);
    fprintf(f, "%d %d %d\n", getpid(), zombie, group);
    fclose(f);
    write(ready[1], "R", 1);
    for (;;) pause();
  }
  close(ready[1]);
  char c;
  return read(ready[0], &c, 1) == 1 ? 0 : 9;
}
