import os
import subprocess
import platform

def start_all_bots():
    # Get the current directory
    current_dir = os.getcwd()
    
    # Get all directories in the current directory
    directories = [d for d in os.listdir(current_dir) if os.path.isdir(os.path.join(current_dir, d))]
    
    bot_count = 0
    
    # Loop through each directory
    for directory in directories:
        dir_path = os.path.join(current_dir, directory)
        index_path = os.path.join(dir_path, "index.js")
        
        # Check if index.js exists in this directory
        if os.path.isfile(index_path):
            print(f"Starting bot in {directory}...")
            
            # Command to run
            if platform.system() == "Windows":
                # For Windows, set title to folder name, color to cyan, clear screen, then run node
                command = f'start cmd /k "title {directory} Bot && color 03 && cls && cd /d "{dir_path}" && node index.js"'
                subprocess.Popen(command, shell=True)
            else:
                # For Linux/macOS (no direct equivalent for window customization)
                # You could use terminal-specific escape sequences for colors if needed
                subprocess.Popen(f'cd "{dir_path}" && node index.js &', shell=True)
            
            bot_count += 1
    
    print(f"All bots started! ({bot_count} bots)")

if __name__ == "__main__":
    start_all_bots()