import os
import shutil
import platform

def create_node_modules_symlinks():
    # Get the current directory
    current_dir = os.getcwd()
    
    # Path to the target node_modules folder in ali_g
    target_node_modules = os.path.join(current_dir, "ali_g", "node_modules")
    
    # Check if the target node_modules exists
    if not os.path.exists(target_node_modules):
        print(f"Error: Target node_modules not found at {target_node_modules}")
        return
    
    # Get all directories in the current directory
    directories = [d for d in os.listdir(current_dir) 
                  if os.path.isdir(os.path.join(current_dir, d)) and d != "ali_g"]
    
    # Create symlinks for each directory
    for directory in directories:
        dir_path = os.path.join(current_dir, directory)
        symlink_path = os.path.join(dir_path, "node_modules")
        
        # Remove existing node_modules if it exists
        if os.path.exists(symlink_path):
            if os.path.islink(symlink_path):
                os.unlink(symlink_path)
                print(f"Removed existing symlink in {directory}")
            else:
                shutil.rmtree(symlink_path)
                print(f"Removed existing node_modules directory in {directory}")
        
        # Create the symlink (platform-specific)
        rel_path = os.path.relpath(target_node_modules, dir_path)
        
        if platform.system() == "Windows":
            # On Windows, we need to use the appropriate symlink function
            import subprocess
            subprocess.run(["mklink", "/D", symlink_path, rel_path], shell=True, check=False)
            print(f"Created symlink in {directory} using mklink")
        else:
            # On Unix-like systems, we can use os.symlink
            os.symlink(rel_path, symlink_path)
            print(f"Created symlink in {directory} -> {rel_path}")
    
    print(f"Created symlinks for {len(directories)} directories")

if __name__ == "__main__":
    create_node_modules_symlinks()