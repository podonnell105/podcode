import readline from 'readline';
import chalk from 'chalk';

/**
 * Utility for displaying scrollable terminal output
 */
export class ScrollableOutput {
  private content: string[];
  private pageSize: number;
  private currentPage: number = 0;
  private totalPages: number = 0;
  private rl: readline.Interface | null = null;

  /**
   * Create a new scrollable output instance
   * @param content The output content to display
   * @param pageSize Number of lines to show per page
   */
  constructor(content: string, pageSize: number = 10) {
    // Split content into lines
    this.content = content.split('\n');
    this.pageSize = pageSize;
    this.totalPages = Math.ceil(this.content.length / this.pageSize);
  }

  /**
   * Display the output with scrolling capability
   */
  async display(): Promise<void> {
    // If content is small enough, just display it directly
    if (this.content.length <= this.pageSize) {
      console.log(this.content.join('\n'));
      return;
    }

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Display first page
    this.displayCurrentPage();

    // Handle user input for scrolling
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve();
        return;
      }

      console.log(chalk.cyan('\nScroll controls: [n]ext page, [p]revious page, [q]uit scrolling'));

      this.rl.on('line', (input) => {
        switch (input.toLowerCase()) {
          case 'n':
            this.nextPage();
            break;
          case 'p':
            this.previousPage();
            break;
          case 'q':
            this.close();
            resolve();
            break;
          default:
            console.log(chalk.yellow('Use n (next), p (previous), or q (quit)'));
        }
      });
    });
  }

  /**
   * Display the current page of content
   */
  private displayCurrentPage(): void {
    // Clear previous output (not perfect but helps)
    console.clear();
    
    const start = this.currentPage * this.pageSize;
    const end = Math.min(start + this.pageSize, this.content.length);
    const pageContent = this.content.slice(start, end);
    
    console.log(pageContent.join('\n'));
    console.log(chalk.cyan(`\n--- Page ${this.currentPage + 1}/${this.totalPages} (${this.content.length} lines) ---`));
  }

  /**
   * Go to the next page
   */
  private nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.displayCurrentPage();
    } else {
      console.log(chalk.yellow('Already at the last page'));
    }
  }

  /**
   * Go to the previous page
   */
  private previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.displayCurrentPage();
    } else {
      console.log(chalk.yellow('Already at the first page'));
    }
  }

  /**
   * Close the readline interface
   */
  private close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

/**
 * Display output with scrolling capability
 * @param output The output content to display
 * @param pageSize Number of lines to show per page
 */
export async function displayScrollableOutput(output: string, pageSize: number = 20): Promise<void> {
  const scrollable = new ScrollableOutput(output, pageSize);
  await scrollable.display();
}
