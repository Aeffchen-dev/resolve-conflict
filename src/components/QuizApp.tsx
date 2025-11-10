import { useState, useEffect, useRef } from 'react';
import { QuizCard } from './QuizCard';
import { CategorySelector } from './CategorySelector';
import { IntroSlide } from './IntroSlide';
import { IntroCard } from './IntroCard';
import { Switch } from './ui/switch';

interface Question {
  question: string;
  category: string;
  depth: 'light' | 'deep';
  type?: string; // "Frage" or "Aktion"
}

interface SlideItem {
  type: 'intro' | 'question';
  question?: Question;
}

// Smart shuffle algorithm to distribute categories more evenly
const smartShuffle = (questions: Question[]): Question[] => {
  // Group questions by category
  const categorizedQuestions: { [category: string]: Question[] } = {};
  questions.forEach(q => {
    if (!categorizedQuestions[q.category]) {
      categorizedQuestions[q.category] = [];
    }
    categorizedQuestions[q.category].push(q);
  });

  // Shuffle questions within each category
  Object.keys(categorizedQuestions).forEach(category => {
    categorizedQuestions[category] = categorizedQuestions[category].sort(() => Math.random() - 0.5);
  });

  const categories = Object.keys(categorizedQuestions);
  const result: Question[] = [];
  const categoryCounters: { [category: string]: number } = {};
  
  // Initialize counters
  categories.forEach(cat => categoryCounters[cat] = 0);

  // Distribute questions more evenly
  while (result.length < questions.length) {
    // Shuffle categories for each round
    const shuffledCategories = [...categories].sort(() => Math.random() - 0.5);
    
    for (const category of shuffledCategories) {
      const categoryQuestions = categorizedQuestions[category];
      const counter = categoryCounters[category];
      
      if (counter < categoryQuestions.length) {
        result.push(categoryQuestions[counter]);
        categoryCounters[category]++;
        
        // Break if we've added all questions
        if (result.length >= questions.length) break;
      }
    }
  }

  return result;
};

export function QuizApp() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animationClass, setAnimationClass] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [introSlide, setIntroSlide] = useState<Question | null>(null);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categorySelectorOpen, setCategorySelectorOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [isMixedMode, setIsMixedMode] = useState(true);
  const [hasToggleBeenChanged, setHasToggleBeenChanged] = useState(false);
  const [categoryColorMap, setCategoryColorMap] = useState<{ [category: string]: number }>({});
  const [logoAnimating, setLogoAnimating] = useState(false);
  const [animatingLetterIndex, setAnimatingLetterIndex] = useState(-1);
  const [toggleAnimating, setToggleAnimating] = useState(false);
  const [loadingSmileyRotating, setLoadingSmileyRotating] = useState(false);
  const [logoSmileyRotating, setLogoSmileyRotating] = useState(false);
  const [showBandaid, setShowBandaid] = useState(true);

  useEffect(() => {
    console.log('QuizApp mounted, loading state:', loading);
    fetchQuestions();
    
    // Show bandaid immediately without animation on load
    setShowBandaid(true);
  }, []);

  // Rotate smiley during loading
  useEffect(() => {
    if (loading) {
      setLoadingSmileyRotating(true);
      setTimeout(() => {
        setLoadingSmileyRotating(false);
      }, 1200);
    }
  }, [loading]);

  // Add touch/mouse handlers for desktop swipe
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let isDragging = false;

    const handleStart = (clientX: number, clientY: number) => {
      startX = clientX;
      startY = clientY;
      isDragging = true;
    };

    const handleEnd = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      
      // Only trigger if horizontal movement is greater than vertical
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          prevQuestion();
        } else {
          nextQuestion();
        }
      }
      
      isDragging = false;
    };

    const handleMouseDown = (e: MouseEvent) => {
      handleStart(e.clientX, e.clientY);
    };

    const handleMouseUp = (e: MouseEvent) => {
      handleEnd(e.clientX, e.clientY);
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      handleEnd(touch.clientX, touch.clientY);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const fetchQuestions = async () => {
    try {
      let csvText = '';
      
      try {
        // Use the new Google Sheets URL with cache busting
        const spreadsheetId = '1IG87hW3UKttiucjEQSv-YXq6tvTUf_NQBgFCcaWw1wM';
        const timestamp = new Date().getTime();
        const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0&cachebust=${timestamp}`;
        
        const response = await fetch(csvUrl, {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch spreadsheet data');
        }
        
        csvText = await response.text();
      } catch (sheetsError) {
        console.log('Google Sheets failed, trying local CSV file:', sheetsError);
        // Fallback to local CSV file
        const localResponse = await fetch('/quiz_questions.csv');
        if (!localResponse.ok) {
          throw new Error('Failed to fetch local CSV data');
        }
        csvText = await localResponse.text();
      }
      
      // Parse CSV data - handle multi-line quoted fields
      const questions: Question[] = [];
      let introContent: Question | null = null;
      
      // Parse CSV properly to handle multi-line quoted fields
      const parseCSV = (csvText: string): string[][] => {
        const result: string[][] = [];
        let current = '';
        let inQuotes = false;
        let row: string[] = [];
        
        for (let i = 0; i < csvText.length; i++) {
          const char = csvText[i];
          
          if (char === '"') {
            if (inQuotes && csvText[i + 1] === '"') {
              // Escaped quote
              current += '"';
              i++; // Skip next quote
            } else {
              // Toggle quote state
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            // Field separator outside quotes
            row.push(current.trim());
            current = '';
          } else if ((char === '\n' || char === '\r') && !inQuotes) {
            // Row separator outside quotes
            if (current.trim() || row.length > 0) {
              row.push(current.trim());
              if (row.some(field => field.length > 0)) {
                result.push(row);
              }
              row = [];
              current = '';
            }
          } else {
            // Regular character or line break inside quotes
            current += char;
          }
        }
        
        // Add the last field and row
        if (current.trim() || row.length > 0) {
          row.push(current.trim());
          if (row.some(field => field.length > 0)) {
            result.push(row);
          }
        }
        
        return result;
      };
      
      const rows = parseCSV(csvText);
      
      for (let i = 0; i < rows.length; i++) {
        const values = rows[i];
        
        // Skip header row
        if (i === 0 && (values[0]?.toLowerCase().includes('categor') || values[1]?.toLowerCase().includes('question'))) {
          continue;
        }
        
        if (values.length >= 2 && values[0] && values[1]) {
          const question: Question = {
            category: values[0],
            question: values[1],
            depth: values[0].toLowerCase() === 'aktion' ? 'deep' : 'light',
            type: values[2] || 'Frage' // Default to "Frage" if third column is empty
          };
          
          // Handle intro content
          if (question.category.toLowerCase() === 'intro') {
            introContent = question;
          } else {
            questions.push(question);
          }
        }
      }
      
      if (questions.length > 0) {
        // Better shuffling algorithm to distribute categories evenly
        const shuffledQuestions = smartShuffle(questions);
        
        setAllQuestions(shuffledQuestions);
        setIntroSlide(introContent);
        
        // Extract unique categories (exclude 'Intro') and assign specific colors
        const categories = Array.from(new Set(questions.map(q => q.category)))
          .filter(cat => cat.toLowerCase() !== 'intro');
        
        // Specific color mapping for each category
        const colorMap: { [category: string]: number } = {};
        categories.forEach((category) => {
          switch(category) {
            case 'Körperliche Intimität':
              colorMap[category] = 0; // Now cyan (category1)
              break;
            case 'Emotionale Intimität':
              colorMap[category] = 1; // Red (category2)
              break;
            case 'Geistige Intimität':
              colorMap[category] = 2; // Now blue (category3)
              break;
            case 'Kreative Intimität':
              colorMap[category] = 3; // Pink (category4)
              break;
            case 'Spielerische Intimität':
              colorMap[category] = 4; // Yellow (category5)
              break;
            case 'Spirituelle Intimität':
              colorMap[category] = 5; // Mint green (category6)
              break;
            case 'Alltagsintimität':
              colorMap[category] = 5; // Mint green (category6)
              break;
            case 'Gemeinsame Abenteuer':
              colorMap[category] = 6; // Orange (category7)
              break;
            default:
              colorMap[category] = categories.indexOf(category) % 7;
          }
        });
        setCategoryColorMap(colorMap);
        setAvailableCategories(categories);
        setSelectedCategories(categories); // Start with all categories selected
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Category and question navigation state
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [questionIndicesPerCategory, setQuestionIndicesPerCategory] = useState<{ [category: string]: number }>({});
  const [categorizedQuestions, setCategorizedQuestions] = useState<{ [category: string]: Question[] }>({});
  
  // Unified drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dragDirection, setDragDirection] = useState<'horizontal' | 'vertical' | null>(null);

  const categories = Object.keys(categorizedQuestions);
  const currentCategory = categories[currentCategoryIndex] || '';
  const questionsInCategory = categorizedQuestions[currentCategory] || [];
  const currentQuestionIndexInCategory = questionIndicesPerCategory[currentCategory] || 0;

  // Animation states
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'left' | 'right' | 'up' | 'down' | null>(null);

  // Intro slide state
  const [currentIntroIndex, setCurrentIntroIndex] = useState(0);
  const totalIntroSlides = 4;
  
  // Micro-animation state
  const [showMicroAnimation, setShowMicroAnimation] = useState(false);
  
  // Trigger micro-animation when on slides 2 or 3
  useEffect(() => {
    if ((currentIntroIndex === 1 || currentIntroIndex === 2) && !isTransitioning && !isDragging) {
      let endTimer: number | undefined;
      const startTimer = window.setTimeout(() => {
        setShowMicroAnimation(true);
        endTimer = window.setTimeout(() => {
          setShowMicroAnimation(false);
        }, 250); // micro animation duration
      }, 300); // initial delay
      return () => {
        window.clearTimeout(startTimer);
        if (endTimer) window.clearTimeout(endTimer);
        setShowMicroAnimation(false);
      };
    } else {
      setShowMicroAnimation(false);
    }
  }, [currentIntroIndex, isTransitioning, isDragging]);

  const nextCategory = () => {
    if (!isTransitioning) {
      // If we're in intro slides 0-2, advance horizontally
      if (!hasSeenIntro && currentIntroIndex < 2) {
        setIsTransitioning(true);
        setTransitionDirection('left');
        
        setTimeout(() => {
          setCurrentIntroIndex(prev => prev + 1);
          setIsTransitioning(false);
          setTransitionDirection(null);
        }, 300);
      } 
      // From slide 2 or 3, horizontal swipe goes to first category
      else if (!hasSeenIntro && (currentIntroIndex === 2 || currentIntroIndex === 3)) {
        setIsTransitioning(true);
        setTransitionDirection('left');
        
        setTimeout(() => {
          setHasSeenIntro(true);
          setCurrentCategoryIndex(0);
          setIsTransitioning(false);
          setTransitionDirection(null);
        }, 300);
      }
      // Normal category navigation (skip intro slides on endless scroll)
      else if (categories.length > 0) {
        setIsTransitioning(true);
        setTransitionDirection('left');
        
        setTimeout(() => {
          setCurrentCategoryIndex((prev) => (prev + 1) % categories.length);
          setIsTransitioning(false);
          setTransitionDirection(null);
        }, 300);
      }
    }
  };

  const prevCategory = () => {
    if (!isTransitioning) {
      // If we're in intro slides 1-2, go back horizontally
      if (!hasSeenIntro && currentIntroIndex > 0 && currentIntroIndex <= 2) {
        setIsTransitioning(true);
        setTransitionDirection('right');
        
        setTimeout(() => {
          setCurrentIntroIndex(prev => prev - 1);
          setIsTransitioning(false);
          setTransitionDirection(null);
        }, 300);
      }
      // Normal category navigation (skip intro slides on endless scroll)
      else if (hasSeenIntro && categories.length > 0) {
        setIsTransitioning(true);
        setTransitionDirection('right');
        
        setTimeout(() => {
          setCurrentCategoryIndex((prev) => (prev - 1 + categories.length) % categories.length);
          setIsTransitioning(false);
          setTransitionDirection(null);
        }, 300);
      }
    }
  };
  
  // New functions for vertical navigation to/from slide 3
  const goToSlide3 = () => {
    if (!isTransitioning && !hasSeenIntro && currentIntroIndex === 2) {
      setIsTransitioning(true);
      setTransitionDirection('down');
      
      setTimeout(() => {
        setCurrentIntroIndex(3);
        setIsTransitioning(false);
        setTransitionDirection(null);
      }, 300);
    }
  };
  
  const returnFromSlide3 = () => {
    if (!isTransitioning && !hasSeenIntro && currentIntroIndex === 3) {
      setIsTransitioning(true);
      setTransitionDirection('up');
      
      setTimeout(() => {
        setCurrentIntroIndex(2);
        setIsTransitioning(false);
        setTransitionDirection(null);
      }, 300);
    }
  };

  const nextQuestion = () => {
    if (isTransitioning) return;
    const newIndex = (currentQuestionIndexInCategory + 1) % questionsInCategory.length;
    setQuestionIndicesPerCategory(prev => ({
      ...prev,
      [currentCategory]: newIndex
    }));
  };

  const prevQuestion = () => {
    if (isTransitioning) return;
    const newIndex = (currentQuestionIndexInCategory - 1 + questionsInCategory.length) % questionsInCategory.length;
    setQuestionIndicesPerCategory(prev => ({
      ...prev,
      [currentCategory]: newIndex
    }));
  };

  // Unified drag handlers that detect direction
  const handleDragStart = (clientX: number, clientY: number) => {
    if (isTransitioning) return;
    setIsDragging(true);
    setDragStartX(clientX);
    setDragStartY(clientY);
    setDragOffsetX(0);
    setDragOffsetY(0);
    setDragDirection(null);
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    
    const offsetX = clientX - dragStartX;
    const offsetY = clientY - dragStartY;
    
    // Determine direction on first significant movement
    if (!dragDirection && (Math.abs(offsetX) > 10 || Math.abs(offsetY) > 10)) {
      // On slide 2, allow vertical if swiping down significantly
      if (!hasSeenIntro && currentIntroIndex === 2 && Math.abs(offsetY) > Math.abs(offsetX)) {
        setDragDirection('vertical');
      } 
      // On slide 3, allow vertical if swiping up significantly  
      else if (!hasSeenIntro && currentIntroIndex === 3 && Math.abs(offsetY) > Math.abs(offsetX)) {
        setDragDirection('vertical');
      }
      // Otherwise determine based on which is greater
      else if (Math.abs(offsetX) > Math.abs(offsetY)) {
        setDragDirection('horizontal');
      } else {
        setDragDirection('vertical');
      }
    }
    
    // Only update offset in the detected direction
    if (dragDirection === 'horizontal') {
      setDragOffsetX(offsetX);
      setDragOffsetY(0);
    } else if (dragDirection === 'vertical') {
      setDragOffsetY(offsetY);
      setDragOffsetX(0);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    
    const threshold = 80;
    
    // Handle intro slide navigation  
    if (!hasSeenIntro) {
      if (dragDirection === 'horizontal' && Math.abs(dragOffsetX) > threshold) {
        if (dragOffsetX > 0) {
          prevCategory();
        } else {
          nextCategory();
        }
      } else if (dragDirection === 'vertical' && Math.abs(dragOffsetY) > threshold) {
        // On slide 2, swipe down goes to slide 3
        if (currentIntroIndex === 2 && dragOffsetY < 0) {
          goToSlide3();
        }
        // On slide 3, swipe up goes back to slide 2
        else if (currentIntroIndex === 3 && dragOffsetY > 0) {
          returnFromSlide3();
        }
      }
    }
    // Handle question navigation
    else {
      if (dragDirection === 'horizontal' && Math.abs(dragOffsetX) > threshold) {
        if (dragOffsetX > 0) {
          prevCategory();
        } else {
          nextCategory();
        }
      } else if (dragDirection === 'vertical' && Math.abs(dragOffsetY) > threshold) {
        if (dragOffsetY > 0) {
          prevQuestion();
        } else {
          nextQuestion();
        }
      }
    }
    
    setIsDragging(false);
    setDragOffsetX(0);
    setDragOffsetY(0);
    setDragDirection(null);
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      prevCategory();
    } else if (e.key === 'ArrowRight') {
      nextCategory();
    } else if (e.key === 'ArrowUp') {
      prevQuestion();
    } else if (e.key === 'ArrowDown') {
      nextQuestion();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentCategoryIndex, currentQuestionIndexInCategory, categorizedQuestions]);

  // Track if we've shown intro slides
  const [hasSeenIntro, setHasSeenIntro] = useState(false);

  // Organize questions by category
  useEffect(() => {
    // Filter by categories
    let filteredQuestions = allQuestions.filter(q => 
      selectedCategories.includes(q.category)
    );
    
    // Filter by type based on toggle
    if (!isMixedMode) {
      filteredQuestions = filteredQuestions.filter(q => q.type === 'Frage');
    }
    
    setQuestions(filteredQuestions);
    
    // Group by category and shuffle within each category
    const categorized: { [category: string]: Question[] } = {};
    filteredQuestions.forEach(q => {
      if (!categorized[q.category]) {
        categorized[q.category] = [];
      }
      categorized[q.category].push(q);
    });
    
    // Fisher-Yates shuffle for proper randomization within each category on every reload
    Object.keys(categorized).forEach(category => {
      const array = categorized[category];
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      categorized[category] = array;
    });
    
    // Sort categories in specific order based on actual CSV data
    const categoryOrder = [
      'Klarheit',
      'Hören & Verstehen',
      'Selbstverantwortung', // No space - matches CSV
      'Brücken bauen'
    ];
    
    const sortedCategorized: { [category: string]: Question[] } = {};
    
    // Only add categories that exist in the data
    categoryOrder.forEach(cat => {
      if (categorized[cat] && categorized[cat].length > 0) {
        sortedCategorized[cat] = categorized[cat];
      }
    });
    
    // Add any remaining categories not in the order list
    Object.keys(categorized).forEach(cat => {
      if (!categoryOrder.includes(cat) && categorized[cat].length > 0) {
        sortedCategorized[cat] = categorized[cat];
      }
    });
    
    setCategorizedQuestions(sortedCategorized);
    
    // Initialize question indices for each category to 0 if not already set
    setQuestionIndicesPerCategory(prev => {
      const newIndices = { ...prev };
      Object.keys(sortedCategorized).forEach(cat => {
        if (!(cat in newIndices)) {
          newIndices[cat] = 0;
        }
      });
      return newIndices;
    });
    
    setCurrentCategoryIndex(0);
  }, [selectedCategories, allQuestions, isMixedMode, hasToggleBeenChanged]);

  const handleCategoriesChange = (categories: string[]) => {
    setSelectedCategories(categories);
  };

  const handleLogoClick = () => {
    if (logoAnimating) return;
    
    setLogoAnimating(true);
    setAnimatingLetterIndex(0);
    
    // Reset band-aid state to allow re-animation
    setShowBandaid(false);
    
    // Text animation duration: 0.5s + (6 letters * 0.1s delay) = 1.1s
    // Band-aid starts AFTER text completes at 1.1s
    setTimeout(() => {
      setShowBandaid(true);
    }, 1100);
    
    // End text animation
    setTimeout(() => {
      setLogoAnimating(false);
      setAnimatingLetterIndex(-1);
    }, 1100);
  };

  const handleToggleChange = (checked: boolean) => {
    // Only animate if the state is actually changing
    if (checked !== isMixedMode) {
      setToggleAnimating(true);
      setIsMixedMode(checked);
      setHasToggleBeenChanged(true);
      
      // Reset animation after toggle completes
      setTimeout(() => {
        setToggleAnimating(false);
      }, 300);
    }
  };

  const handleToggleClick = (mode: boolean) => {
    // Only animate if the state is actually changing
    if (mode !== isMixedMode) {
      setToggleAnimating(true);
      setIsMixedMode(mode);
      setHasToggleBeenChanged(true);
      
      // Reset animation after toggle completes
      setTimeout(() => {
        setToggleAnimating(false);
      }, 300);
    }
  };

  const hasQuestions = questionsInCategory.length > 0;
  const currentQuestion = hasQuestions ? questionsInCategory[currentQuestionIndexInCategory] : null;

  return (
    <div className="min-h-[100svh] h-[100svh] bg-background overflow-hidden flex flex-col relative" style={{ height: '100svh' }}>
      {/* App Header with controls - Always visible */}
      <div 
        className="mt-4 flex items-center justify-between w-full px-4 relative z-50 transition-opacity duration-300" 
        style={{ 
          paddingTop: 'env(safe-area-inset-top, 0)',
          opacity: loading ? 0 : 1
        }}
      >
        <div 
          className="text-white cursor-pointer relative flex items-center" 
          style={{ fontFamily: 'Kokoro, serif', fontSize: '25px', fontWeight: 'bold', fontStyle: 'italic', lineHeight: '1' }}
          onClick={handleLogoClick}
        >
          {['C', 'o', 'n', 'f', 'l', 'i', 'c', 't', 's'].map((letter, index) => (
            <span
              key={index}
              style={{
                display: 'inline-block',
                position: 'relative',
                opacity: logoAnimating ? 0 : 1,
                animation: logoAnimating ? `letterReveal${index} 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${index * 0.1}s forwards` : 'none'
              }}
            >
              {letter}
              {index === 4 && ( // Position on 'l'
                <div 
                  style={{
                    position: 'absolute',
                    right: '-6px',
                    bottom: '-2px',
                    transform: 'rotate(-45deg) scale(1.09)',
                    perspective: '1000px',
                    transformStyle: 'preserve-3d',
                    opacity: showBandaid ? 1 : 0,
                    filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))',
                    transition: 'none'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Main bandaid body with gradient */}
                    <defs>
                      <linearGradient id="bandaidGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: '#d9b38c', stopOpacity: 1 }} />
                        <stop offset="50%" style={{ stopColor: '#d4a574', stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: '#c9986a', stopOpacity: 1 }} />
                      </linearGradient>
                    </defs>
                    <rect x="1" y="4" width="30" height="16" rx="5" fill="url(#bandaidGradient)" stroke="#b8946a" strokeWidth="0.5"/>
                    
                    {/* Center pad (lighter area) */}
                    <rect x="11" y="6" width="10" height="12" rx="2" fill="#e5d4b8" opacity="0.9"/>
                    
                    {/* Holes pattern - white dots */}
                    <circle cx="5" cy="8" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="8" cy="8" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="5" cy="12" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="8" cy="12" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="5" cy="16" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="8" cy="16" r="0.8" fill="white" opacity="0.9"/>
                    
                    <circle cx="24" cy="8" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="27" cy="8" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="24" cy="12" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="27" cy="12" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="24" cy="16" r="0.8" fill="white" opacity="0.9"/>
                    <circle cx="27" cy="16" r="0.8" fill="white" opacity="0.9"/>
                    
                    {/* Center pad holes (smaller, less visible) */}
                    <circle cx="13" cy="10" r="0.5" fill="#c9a680" opacity="0.4"/>
                    <circle cx="16" cy="10" r="0.5" fill="#c9a680" opacity="0.4"/>
                    <circle cx="19" cy="10" r="0.5" fill="#c9a680" opacity="0.4"/>
                    <circle cx="13" cy="14" r="0.5" fill="#c9a680" opacity="0.4"/>
                    <circle cx="16" cy="14" r="0.5" fill="#c9a680" opacity="0.4"/>
                    <circle cx="19" cy="14" r="0.5" fill="#c9a680" opacity="0.4"/>
                  </svg>
                </div>
              )}
            </span>
          ))}
        </div>
        <style>{`
          @keyframes letterReveal0 {
            0% {
              opacity: 0;
              filter: blur(8px);
              transform: translateX(-10px);
            }
            100% {
              opacity: 1;
              filter: blur(0px);
              transform: translateX(0);
            }
          }
          
          @keyframes letterReveal1 {
            0% {
              opacity: 0;
              filter: blur(6px);
              transform: translateX(-8px);
            }
            100% {
              opacity: 1;
              filter: blur(0px);
              transform: translateX(0);
            }
          }
          
          @keyframes letterReveal2 {
            0% {
              opacity: 0;
              filter: blur(10px);
              transform: translateX(-12px);
            }
            100% {
              opacity: 1;
              filter: blur(0px);
              transform: translateX(0);
            }
          }
          
          @keyframes letterReveal3 {
            0% {
              opacity: 0;
              filter: blur(7px);
              transform: translateX(-9px);
            }
            100% {
              opacity: 1;
              filter: blur(0px);
              transform: translateX(0);
            }
          }
          
          @keyframes letterReveal4 {
            0% {
              opacity: 0;
              filter: blur(9px);
              transform: translateX(-11px);
            }
            100% {
              opacity: 1;
              filter: blur(0px);
              transform: translateX(0);
            }
          }
          
          @keyframes letterReveal5 {
            0% {
              opacity: 0;
              filter: blur(5px);
              transform: translateX(-7px);
            }
            100% {
              opacity: 1;
              filter: blur(0px);
              transform: translateX(0);
            }
          }
          
          @keyframes letterReveal6 {
            0% {
              opacity: 0;
              filter: blur(11px);
              transform: translateX(-13px);
            }
            100% {
              opacity: 1;
              filter: blur(0px);
              transform: translateX(0);
            }
          }
          
          @keyframes applyBandaid {
            0% {
              transform: rotate(-45deg) scale(1.09, 1.09) rotateZ(0deg);
              opacity: 0;
              filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.2));
            }
            30% {
              transform: rotate(-45deg) scale(1.36, 1.23) rotateZ(-8deg);
              opacity: 1;
              filter: drop-shadow(3px 4px 6px rgba(0,0,0,0.35));
            }
            80% {
              transform: rotate(-45deg) scale(1.11, 1.10) rotateZ(-0.3deg);
              opacity: 1;
              filter: drop-shadow(1.5px 1.5px 2.5px rgba(0,0,0,0.22));
            }
            100% {
              transform: rotate(-45deg) scale(1.09, 1.09) rotateZ(0deg);
              opacity: 1;
              filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.2));
            }
          }
          
          @keyframes wiggle-loading {
            0% {
              transform: rotate(-45deg) scale(1.56) perspective(500px) rotateX(60deg) rotateY(-15deg) rotateZ(-3deg);
              opacity: 0.7;
            }
            40% {
              transform: rotate(-45deg) scale(1.56) perspective(500px) rotateX(20deg) rotateY(-5deg) rotateZ(2deg);
              opacity: 1;
            }
            60% {
              transform: rotate(-45deg) scale(1.56) perspective(500px) rotateX(5deg) rotateY(2deg) rotateZ(-1deg);
              opacity: 1;
            }
            80% {
              transform: rotate(-45deg) scale(1.56) perspective(500px) rotateX(-2deg) rotateY(0deg) rotateZ(1deg);
              opacity: 1;
            }
            100% {
              transform: rotate(-45deg) scale(1.56) perspective(500px) rotateX(0deg) rotateY(0deg) rotateZ(0deg);
              opacity: 1;
            }
          }
          
          .animate-wiggle-loading {
            animation: wiggle-loading 1.2s ease-out infinite;
            transform-style: preserve-3d;
          }
        `}</style>
        <button 
          onClick={() => setCategorySelectorOpen(true)}
          className="text-white font-normal flex items-center"
          style={{ fontSize: '14px' }}
        >
          Kategorien wählen
        </button>
      </div>

      {/* Main Quiz Container */}
      <div 
        className="flex-1 flex flex-col px-4 pb-4 mt-4 transition-opacity duration-300" 
        style={{ 
          minHeight: 0, 
          overflow: 'visible',
          opacity: loading ? 0 : 1
        }}
      >
        <div className="flex-1 flex items-stretch justify-center min-h-0 relative" style={{ overflow: 'visible' }}>
          {loading ? (
            <div 
              className="flex items-center justify-center h-full w-full" 
              style={{ 
                perspective: '1000px',
                backgroundColor: 'transparent'
              }}
            >
              <div className="animate-wiggle-loading">
                <svg 
                  width="31" 
                  height="31" 
                  viewBox="0 0 32 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Main bandaid body with gradient */}
                  <defs>
                    <linearGradient id="bandaidGradientLoading" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#d9b38c', stopOpacity: 1 }} />
                      <stop offset="50%" style={{ stopColor: '#d4a574', stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: '#c9986a', stopOpacity: 1 }} />
                    </linearGradient>
                  </defs>
                  <rect x="1" y="4" width="30" height="16" rx="5" fill="url(#bandaidGradientLoading)" stroke="#b8946a" strokeWidth="0.5"/>
                  
                  {/* Center pad (lighter area) */}
                  <rect x="11" y="6" width="10" height="12" rx="2" fill="#e5d4b8" opacity="0.9"/>
                  
                  {/* Holes pattern - white dots */}
                  <circle cx="5" cy="8" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="8" cy="8" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="5" cy="12" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="8" cy="12" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="5" cy="16" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="8" cy="16" r="0.8" fill="white" opacity="0.9"/>
                  
                  <circle cx="24" cy="8" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="27" cy="8" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="24" cy="12" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="27" cy="12" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="24" cy="16" r="0.8" fill="white" opacity="0.9"/>
                  <circle cx="27" cy="16" r="0.8" fill="white" opacity="0.9"/>
                  
                  {/* Center pad holes (smaller, less visible) */}
                  <circle cx="13" cy="10" r="0.5" fill="#c9a680" opacity="0.4"/>
                  <circle cx="16" cy="10" r="0.5" fill="#c9a680" opacity="0.4"/>
                  <circle cx="19" cy="10" r="0.5" fill="#c9a680" opacity="0.4"/>
                  <circle cx="13" cy="14" r="0.5" fill="#c9a680" opacity="0.4"/>
                  <circle cx="16" cy="14" r="0.5" fill="#c9a680" opacity="0.4"/>
                  <circle cx="19" cy="14" r="0.5" fill="#c9a680" opacity="0.4"/>
                </svg>
              </div>
            </div>
          ) : !hasSeenIntro ? (
            /* Render intro slides */
            <div 
              className="relative w-full h-full flex items-center justify-center"
              onMouseDown={(e) => {
                handleDragStart(e.clientX, e.clientY);
              }}
              onMouseMove={(e) => {
                handleDragMove(e.clientX, e.clientY);
              }}
              onMouseUp={() => {
                handleDragEnd();
              }}
              onMouseLeave={() => {
                if (isDragging) {
                  handleDragEnd();
                }
              }}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                handleDragStart(touch.clientX, touch.clientY);
              }}
              onTouchMove={(e) => {
                const touch = e.touches[0];
                handleDragMove(touch.clientX, touch.clientY);
              }}
              onTouchEnd={() => {
                handleDragEnd();
              }}
            >
              {/* Render intro slides with horizontal transitions */}
              {[0, 1, 2, 3].map((slideIndex) => {
                const isActive = slideIndex === currentIntroIndex;
                const isPrev = slideIndex === currentIntroIndex - 1;
                const isNext = slideIndex === currentIntroIndex + 1;
                
                if (!isActive && !isPrev && !isNext) return null;
                
                let transform = '';
                let zIndex = 1;
                
                if (isActive) {
                  if (isDragging && dragDirection === 'horizontal') {
                    const dragProgress = Math.abs(dragOffsetX) / 300;
                    const scale = Math.max(0.8, 1 - dragProgress * 0.2);
                    transform = `translateX(${dragOffsetX}px) scale(${scale})`;
                  } else if (isDragging && dragDirection === 'vertical' && currentIntroIndex === 2) {
                    // Allow vertical dragging on slide 2 to peek at slide 3
                    const dragProgress = Math.abs(dragOffsetY) / 300;
                    const scale = Math.max(0.8, 1 - dragProgress * 0.2);
                    transform = `translateY(${dragOffsetY}px) scale(${scale})`;
                  } else if (isTransitioning && transitionDirection === 'left') {
                    transform = 'translateX(calc(-100% - 16px)) scale(0.8)';
                  } else if (isTransitioning && transitionDirection === 'right') {
                    transform = 'translateX(calc(100% + 16px)) scale(0.8)';
                  } else if (isTransitioning && transitionDirection === 'down') {
                    transform = 'translateY(calc(-100% - 16px)) scale(0.8)';
                  } else if (isTransitioning && transitionDirection === 'up') {
                    transform = 'translateY(calc(100% + 16px)) scale(0.8)';
                  } else if (showMicroAnimation && currentIntroIndex === 1) {
                    // Horizontal micro-animation: slide more visibly left
                    transform = 'translateX(-25%) scale(0.96)';
                  } else if (showMicroAnimation && currentIntroIndex === 2) {
                    // Vertical micro-animation: slide more visibly up
                    transform = 'translateY(-25%) scale(0.96)';
                  } else {
                    transform = currentIntroIndex === 2 ? 'translateY(0) scale(1)' : 'translateX(0) scale(1)';
                  }
                  zIndex = 3;
                } else if (isPrev) {
                  if (isDragging && dragDirection === 'horizontal') {
                    const dragProgress = Math.abs(dragOffsetX) / 300;
                    const scale = Math.min(1, 0.8 + dragProgress * 0.2);
                    transform = `translateX(calc(-100% - 16px + ${dragOffsetX}px)) scale(${scale})`;
                  } else if (isDragging && dragDirection === 'vertical' && currentIntroIndex === 3) {
                    const dragProgress = Math.abs(dragOffsetY) / 300;
                    const scale = Math.min(1, 0.8 + dragProgress * 0.2);
                    transform = `translateY(calc(-100% - 16px + ${dragOffsetY}px)) scale(${scale})`;
                  } else if (isTransitioning && transitionDirection === 'right') {
                    transform = 'translateX(0) scale(1)';
                  } else if (isTransitioning && transitionDirection === 'up') {
                    transform = 'translateY(0) scale(1)';
                  } else if (isTransitioning && transitionDirection === 'left' && currentIntroIndex === 3) {
                    // During horizontal transition from slide 3, hide previous slides
                    transform = 'translateX(calc(-100% - 16px)) scale(0.8)';
                  } else {
                    // Slide 3's previous is slide 2, which is above (vertical)
                    if (currentIntroIndex === 3 && slideIndex === 2) {
                      transform = 'translateY(calc(-100% - 16px)) scale(0.8)';
                    } else {
                      transform = 'translateX(calc(-100% - 16px)) scale(0.8)';
                    }
                  }
                  zIndex = 1;
                } else if (isNext) {
                  if (isDragging && dragDirection === 'horizontal') {
                    const dragProgress = Math.abs(dragOffsetX) / 300;
                    const scale = Math.min(1, 0.8 + dragProgress * 0.2);
                    
                    // Slide 3 follows slide 2 horizontally while staying vertically positioned below
                    if (currentIntroIndex === 2 && slideIndex === 3) {
                      transform = `translateX(${dragOffsetX}px) translateY(calc(100% + 16px)) scale(0.8)`;
                    } else {
                      transform = `translateX(calc(100% + 16px + ${dragOffsetX}px)) scale(${scale})`;
                    }
                  } else if (isDragging && dragDirection === 'vertical' && currentIntroIndex === 2) {
                    const dragProgress = Math.abs(dragOffsetY) / 300;
                    const scale = Math.min(1, 0.8 + dragProgress * 0.2);
                    transform = `translateY(calc(100% + 16px + ${dragOffsetY}px)) scale(${scale})`;
                  } else if (isTransitioning && transitionDirection === 'left') {
                    // During horizontal transition from slide 2, slide 3 moves with it
                    if (currentIntroIndex === 2 && slideIndex === 3) {
                      transform = 'translateX(calc(-100% - 16px)) translateY(calc(100% + 16px)) scale(0.8)';
                    } else {
                      transform = 'translateX(0) scale(1)';
                    }
                  } else if (isTransitioning && transitionDirection === 'down') {
                    transform = 'translateY(0) scale(1)';
                  } else if (showMicroAnimation && currentIntroIndex === 1) {
                    // Horizontal micro-animation: next slide peeks in more from right
                    transform = 'translateX(calc(100% + 16px - 30%)) scale(0.88)';
                  } else if (showMicroAnimation && currentIntroIndex === 2) {
                    // Vertical micro-animation: next slide (slide 3) peeks in more from bottom
                    transform = 'translateY(calc(100% + 16px - 30%)) scale(0.88)';
                  } else {
                    // Slide 3 is vertically below slide 2
                    if (currentIntroIndex === 2 && slideIndex === 3) {
                      transform = 'translateY(calc(100% + 16px)) scale(0.8)';
                    } else {
                      transform = 'translateX(calc(100% + 16px)) scale(0.8)';
                    }
                  }
                  zIndex = 1;
                }
                
                return (
                  <div
                    key={`intro-${slideIndex}`}
                    className={`absolute inset-0 w-full h-full ${isActive ? 'pointer-events-auto' : 'pointer-events-none'}`}
                    style={{
                      transform,
                      zIndex,
                      transition: isDragging ? 'none' : (isTransitioning || showMicroAnimation) ? 'transform 0.25s ease-in-out' : 'transform 0.3s ease-in-out',
                    }}
                  >
                    <IntroCard 
                      slideIndex={slideIndex} 
                      isActive={isActive} 
                      isNext={isNext} 
                      isPrev={isPrev}
                      onSwipeLeft={nextCategory}
                      onSwipeRight={prevCategory}
                      isTransitioning={isTransitioning || isDragging}
                    />
                  </div>
                );
              })}
              
              {/* Render first category slide when transitioning from slide 2 */}
              {currentIntroIndex === 2 && categories.length > 0 && (
                <div
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{
                    transform: (isDragging && dragDirection === 'horizontal' && dragOffsetX < 0) 
                      ? `translateX(calc(100% + 16px + ${dragOffsetX}px)) scale(${Math.min(1, 0.8 + Math.abs(dragOffsetX) / 300 * 0.2)})`
                      : (isTransitioning && transitionDirection === 'left')
                        ? 'translateX(0) scale(1)'
                        : 'translateX(calc(100% + 16px)) scale(0.8)',
                    zIndex: isTransitioning && transitionDirection === 'left' ? 4 : 2,
                    transition: isDragging ? 'none' : 'transform 0.3s ease-in-out',
                  }}
                >
                  {(() => {
                    const firstCategory = categories[0];
                    const categoryQuestions = categorizedQuestions[firstCategory] || [];
                    const questionIndexForCategory = questionIndicesPerCategory[firstCategory] || 0;
                    
                    return categoryQuestions.map((q, qIndex) => {
                      const isCurrent = qIndex === questionIndexForCategory;
                      const isNext = qIndex === (questionIndexForCategory + 1) % categoryQuestions.length;
                      
                      // Show current and next question during transition
                      if (!isCurrent && !isNext) return null;
                      
                      return (
                        <div
                          key={`preview-${firstCategory}-${qIndex}`}
                          className="absolute w-full h-full pointer-events-none"
                          style={{
                            height: isCurrent ? 'calc(90% - 8px)' : '100%',
                            top: 0,
                            left: 0,
                            right: 0,
                            transform: isCurrent ? 'translateY(0) scale(1)' : 'translateY(calc(90% + 16px)) scale(1)',
                            zIndex: isCurrent ? 3 : 1,
                          }}
                        >
                          <QuizCard
                            question={q}
                            onSwipeLeft={nextCategory}
                            onSwipeRight={prevCategory}
                            onSwipeUp={nextQuestion}
                            onSwipeDown={prevQuestion}
                            categoryIndex={categoryColorMap[firstCategory] || 0}
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
              
              {/* Render first category slide when transitioning from slide 3 */}
              {currentIntroIndex === 3 && categories.length > 0 && (
                <div
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{
                    transform: (isDragging && dragDirection === 'horizontal' && dragOffsetX < 0) 
                      ? `translateX(calc(100% + 16px + ${dragOffsetX}px)) scale(${Math.min(1, 0.8 + Math.abs(dragOffsetX) / 300 * 0.2)})`
                      : (isTransitioning && transitionDirection === 'left')
                        ? 'translateX(0) scale(1)'
                        : 'translateX(calc(100% + 16px)) scale(0.8)',
                    zIndex: isTransitioning && transitionDirection === 'left' ? 4 : 2,
                    transition: isDragging ? 'none' : 'transform 0.3s ease-in-out',
                  }}
                >
                  {(() => {
                    const firstCategory = categories[0];
                    const categoryQuestions = categorizedQuestions[firstCategory] || [];
                    const questionIndexForCategory = questionIndicesPerCategory[firstCategory] || 0;
                    
                    return categoryQuestions.map((q, qIndex) => {
                      const isCurrent = qIndex === questionIndexForCategory;
                      const isNext = qIndex === (questionIndexForCategory + 1) % categoryQuestions.length;
                      
                      // Show current and next question during transition
                      if (!isCurrent && !isNext) return null;
                      
                      return (
                        <div
                          key={`preview-slide3-${firstCategory}-${qIndex}`}
                          className="absolute w-full h-full pointer-events-none"
                          style={{
                            height: isCurrent ? 'calc(90% - 8px)' : '100%',
                            top: 0,
                            left: 0,
                            right: 0,
                            transform: isCurrent ? 'translateY(0) scale(1)' : 'translateY(calc(90% + 16px)) scale(1)',
                            zIndex: isCurrent ? 3 : 1,
                          }}
                        >
                          <QuizCard
                            question={q}
                            onSwipeLeft={nextCategory}
                            onSwipeRight={prevCategory}
                            onSwipeUp={nextQuestion}
                            onSwipeDown={prevQuestion}
                            categoryIndex={categoryColorMap[firstCategory] || 0}
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          ) : hasQuestions && currentQuestion ? (
            <div 
              className="relative w-full h-full flex items-center justify-center"
              onMouseDown={(e) => {
                handleDragStart(e.clientX, e.clientY);
              }}
              onMouseMove={(e) => {
                handleDragMove(e.clientX, e.clientY);
              }}
              onMouseUp={() => {
                handleDragEnd();
              }}
              onMouseLeave={() => {
                if (isDragging) {
                  handleDragEnd();
                }
              }}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                handleDragStart(touch.clientX, touch.clientY);
              }}
              onTouchMove={(e) => {
                const touch = e.touches[0];
                handleDragMove(touch.clientX, touch.clientY);
              }}
              onTouchEnd={() => {
                handleDragEnd();
              }}
            >
              {/* Render previous, current, and next categories */}
              {categories.map((category, catIndex) => {
                const isActiveCategory = catIndex === currentCategoryIndex;
                const isPrevCategory = catIndex === (currentCategoryIndex - 1 + categories.length) % categories.length;
                const isNextCategory = catIndex === (currentCategoryIndex + 1) % categories.length;
                
                if (!isActiveCategory && !isPrevCategory && !isNextCategory) return null;
                
                const categoryQuestions = categorizedQuestions[category] || [];
                const questionIndexForCategory = questionIndicesPerCategory[category] || 0;
                
                // Calculate horizontal transform for this category
                let categoryHorizontalTransform = '';
                let categoryZIndex = 1;
                
                if (isActiveCategory) {
                  if (isDragging && dragDirection === 'horizontal') {
                    const dragProgress = Math.abs(dragOffsetX) / 300;
                    const scale = Math.max(0.8, 1 - dragProgress * 0.2);
                    const rotation = dragOffsetX > 0 ? dragProgress * 5 : -dragProgress * 5;
                    categoryHorizontalTransform = `translateX(${dragOffsetX}px) scale(${scale}) rotate(${rotation}deg)`;
                  } else if (isTransitioning && transitionDirection === 'left') {
                    categoryHorizontalTransform = 'translateX(calc(-100% - 16px)) scale(0.8) rotate(-5deg)';
                  } else if (isTransitioning && transitionDirection === 'right') {
                    categoryHorizontalTransform = 'translateX(calc(100% + 16px)) scale(0.8) rotate(5deg)';
                  } else {
                    categoryHorizontalTransform = 'translateX(0) scale(1) rotate(0deg)';
                  }
                  categoryZIndex = 3;
                } else if (isPrevCategory) {
                  if (isDragging && dragDirection === 'horizontal') {
                    const dragProgress = Math.abs(dragOffsetX) / 300;
                    const scale = Math.min(1, 0.8 + dragProgress * 0.2);
                    categoryHorizontalTransform = `translateX(calc(-100% - 16px + ${dragOffsetX}px)) scale(${scale}) rotate(0deg)`;
                  } else if (isTransitioning && transitionDirection === 'right') {
                    categoryHorizontalTransform = 'translateX(0) scale(1) rotate(0deg)';
                  } else {
                    categoryHorizontalTransform = 'translateX(calc(-100% - 16px)) scale(0.8) rotate(0deg)';
                  }
                  categoryZIndex = 1;
                } else if (isNextCategory) {
                  if (isDragging && dragDirection === 'horizontal') {
                    const dragProgress = Math.abs(dragOffsetX) / 300;
                    const scale = Math.min(1, 0.8 + dragProgress * 0.2);
                    categoryHorizontalTransform = `translateX(calc(100% + 16px + ${dragOffsetX}px)) scale(${scale}) rotate(0deg)`;
                  } else if (isTransitioning && transitionDirection === 'left') {
                    categoryHorizontalTransform = 'translateX(0) scale(1) rotate(0deg)';
                  } else {
                    categoryHorizontalTransform = 'translateX(calc(100% + 16px)) scale(0.8) rotate(0deg)';
                  }
                  categoryZIndex = 1;
                }
                
                // Create a DOM element for every question in this category
                return categoryQuestions.map((question, qIndex) => {
                  const relativePosition = qIndex - questionIndexForCategory;
                  const normalizedPosition = relativePosition >= 0 
                    ? relativePosition 
                    : relativePosition + categoryQuestions.length;
                  
                  // Render: beforePrev(-2), prev(-1), current(0), next(1), afterNext(2)
                  if (normalizedPosition > 2 && normalizedPosition < categoryQuestions.length - 2) {
                    return null;
                  }
                  
                  const isCurrent = qIndex === questionIndexForCategory;
                  const isNext = qIndex === (questionIndexForCategory + 1) % categoryQuestions.length;
                  const isPrev = qIndex === (questionIndexForCategory - 1 + categoryQuestions.length) % categoryQuestions.length;
                  const isAfterNext = qIndex === (questionIndexForCategory + 2) % categoryQuestions.length;
                  const isBeforePrev = qIndex === (questionIndexForCategory - 2 + categoryQuestions.length) % categoryQuestions.length;
                  
                  let verticalTransform = '';
                  let verticalZIndex = 1;
                  
                  // For previous category during horizontal transition, show current + next question
                  if (isPrevCategory && !isCurrent && !isNext) {
                    return null; // Show current and next question for previous category
                  }
                  
                  // For next category during horizontal transition/drag, show current + next vertical
                  if (isNextCategory && !isCurrent && !isNext) {
                    return null; // Show current and next question for next category
                  }
                  
                  // For active category during horizontal drag/transition, always show current + next vertical
                  if (isActiveCategory && (isDragging && dragDirection === 'horizontal' || isTransitioning && (transitionDirection === 'left' || transitionDirection === 'right'))) {
                    // Show both current and next question
                    if (!isCurrent && !isNext) {
                      return null;
                    }
                  } else if (isActiveCategory && !isCurrent && !isNext && !isPrev && !isBeforePrev && !isAfterNext) {
                    return null;
                  }
                  
                  if (isBeforePrev) {
                    // Before previous question - far above viewport
                    if (isActiveCategory && isDragging && dragDirection === 'vertical') {
                      const dragProgress = Math.min(Math.abs(dragOffsetY) / 300, 1);
                      const scale = dragOffsetY > 0 ? Math.min(1, 0.85 + dragProgress * 0.15) : 1;
                      verticalTransform = `translateY(calc(-300% + ${dragOffsetY}px)) scale(${scale})`;
                    } else {
                      verticalTransform = 'translateY(-300%) scale(1)';
                    }
                    verticalZIndex = 0;
                  } else if (isPrev) {
                    // Previous question - completely out of viewport above
                    if (isActiveCategory && isDragging && dragDirection === 'vertical') {
                      const dragProgress = Math.min(Math.abs(dragOffsetY) / 300, 1);
                      const scale = dragOffsetY > 0 ? Math.min(1, 0.85 + dragProgress * 0.15) : 1;
                      verticalTransform = `translateY(calc(-200% + ${dragOffsetY}px)) scale(${scale})`;
                    } else if (isActiveCategory && isTransitioning && transitionDirection === 'up') {
                      // During upward transition, move all slides together
                      verticalTransform = 'translateY(calc(100% + 16px)) scale(1)';
                    } else {
                      verticalTransform = 'translateY(-200%) scale(1)';
                    }
                    verticalZIndex = 0;
                  } else if (isCurrent) {
                    // Current question - takes 90% of viewport, 10% of next visible
                    if (isActiveCategory && isDragging && dragDirection === 'vertical') {
                      const dragProgress = Math.min(Math.abs(dragOffsetY) / 300, 1);
                      const scale = Math.max(0.85, 1 - dragProgress * 0.15);
                      verticalTransform = `translateY(${dragOffsetY}px) scale(${scale})`;
                    } else if (isActiveCategory && isTransitioning && transitionDirection === 'up') {
                      // During upward transition, move all slides together
                      verticalTransform = 'translateY(calc(200% + 32px)) scale(0.85)';
                    } else {
                      verticalTransform = 'translateY(0) scale(1)';
                    }
                    verticalZIndex = 2;
                  } else if (isNext) {
                    // Next question - positioned so 10% is visible in viewport
                    if (isActiveCategory && isDragging && dragDirection === 'vertical') {
                      const dragProgress = Math.min(Math.abs(dragOffsetY) / 300, 1);
                      const scale = dragOffsetY < 0 ? Math.min(1, 0.85 + dragProgress * 0.15) : 1;
                      verticalTransform = `translateY(calc(90% + 16px + ${dragOffsetY}px)) scale(${scale})`;
                    } else if (isActiveCategory && isTransitioning && transitionDirection === 'up') {
                      // During upward transition, move all slides together
                      verticalTransform = 'translateY(calc(290% + 48px)) scale(1)';
                    } else {
                      verticalTransform = 'translateY(calc(90% + 16px)) scale(1)';
                    }
                    verticalZIndex = 1;
                  } else if (isAfterNext) {
                    // After next question - positioned below next
                    if (isActiveCategory && isDragging && dragDirection === 'vertical') {
                      const dragProgress = Math.min(Math.abs(dragOffsetY) / 300, 1);
                      const scale = dragOffsetY < 0 ? Math.min(1, 0.85 + dragProgress * 0.15) : 1;
                      verticalTransform = `translateY(calc(180% + 32px + ${dragOffsetY}px)) scale(${scale})`;
                    } else {
                      verticalTransform = 'translateY(calc(180% + 32px)) scale(1)';
                    }
                    verticalZIndex = 1;
                  }
                  
                  return (
                    <div
                      key={`category-${catIndex}-question-${qIndex}`}
                      className={`absolute w-full ${isActiveCategory && isCurrent ? 'pointer-events-auto' : 'pointer-events-none'}`}
                      style={{
                        height: isCurrent ? 'calc(90% - 8px)' : '100%',
                        top: 0,
                        left: 0,
                        right: 0,
                        transform: `${categoryHorizontalTransform} ${verticalTransform}`,
                        zIndex: categoryZIndex * 10 + verticalZIndex,
                        transition: isDragging 
                          ? 'none' 
                          : 'transform 0.3s ease-in-out',
                        pointerEvents: isActiveCategory && isCurrent ? 'auto' : 'none'
                      }}
                    >
                      <QuizCard
                        question={question}
                        onSwipeLeft={nextCategory}
                        onSwipeRight={prevCategory}
                        onSwipeUp={prevQuestion}
                        onSwipeDown={nextQuestion}
                        categoryIndex={categoryColorMap[question.category] || 0}
                        onDragStart={() => {}}
                        onDragMove={() => {}}
                        onDragEnd={() => {}}
                        dragOffset={0}
                        isDragging={false}
                      />
                    </div>
                  );
                });
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-white" style={{ fontSize: '14px' }}>Keine Fragen verfügbar</div>
          )}
        </div>
      </div>
      
      <CategorySelector
        open={categorySelectorOpen}
        onOpenChange={setCategorySelectorOpen}
        categories={availableCategories}
        selectedCategories={selectedCategories}
        onCategoriesChange={handleCategoriesChange}
      />
    </div>
  );
}